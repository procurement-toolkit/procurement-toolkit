"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Company email convention: hk + 4-digit employee number @hkk.co.kr
// (e.g. hk0201@hkk.co.kr). Kevin's own admin login (jaehuipark@gmail.com)
// predates this convention and was created directly in Supabase, so it's
// intentionally not affected by this check — this only gates NEW accounts
// created through the admin dashboard.
const EMPLOYEE_EMAIL_RE = /^hk\d{4}@hkk\.co\.kr$/i;

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") {
    throw new Error("관리자만 사용할 수 있습니다");
  }

  return { userId: user.id };
}

export async function listUsers() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, name, email, role, is_active, pis_access, created_at, departments(name)")
    .order("created_at", { ascending: true });
  return data ?? [];
}

// Login history is tracked by the app itself (login_events, written by
// signIn in actions/auth.ts) rather than Supabase's own audit log — on this
// project auth.audit_log_entries never actually accumulated rows.
export async function getUserDetail(userId: string) {
  await requireAdmin();
  const admin = createAdminClient();

  const [{ data: profile }, { data: logins }, { data: activity }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, name, email, role, is_active, pis_access, created_at, departments(name)")
      .eq("id", userId)
      .maybeSingle(),
    admin
      .from("login_events")
      .select("created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30),
    admin
      .from("transactions")
      .select(
        `id, txn_type, txn_date, from_location_code, to_location_code, reason, note,
         transaction_details(item_code, qty, process, items(item_name)),
         shipments(recipient, carrier, tracking_no)`
      )
      .eq("processed_by", userId)
      .order("txn_date", { ascending: false })
      .limit(50),
  ]);

  return { profile, logins: logins ?? [], activity: activity ?? [] };
}

const createUserSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력해주세요"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .regex(EMPLOYEE_EMAIL_RE, "이메일 형식은 hk0000@hkk.co.kr 이어야 합니다"),
  departmentId: z.string().optional(),
  password: z.string().min(6, "비밀번호는 6자 이상이어야 합니다"),
});

export async function createFieldUser(input: unknown): Promise<ActionResult> {
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요" };
  }

  try {
    await requireAdmin();

    const admin = createAdminClient();
    const { name, email, departmentId, password } = parsed.data;

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createErr || !created.user) {
      console.error("createUser failed:", createErr);
      const message = createErr?.message.includes("already been registered")
        ? "이미 등록된 이메일입니다"
        : `계정 생성 중 오류가 발생했습니다${createErr ? `: ${createErr.message}` : ""}`;
      return { ok: false, error: message };
    }

    const { error: profileErr } = await admin.from("profiles").insert({
      id: created.user.id,
      name,
      email,
      department_id: departmentId || null,
      role: "field",
      is_active: true,
    });

    if (profileErr) {
      console.error("profile insert failed:", profileErr);
      // roll back the orphaned auth user so a failed insert doesn't leave a
      // login-capable account with no profile row
      await admin.auth.admin.deleteUser(created.user.id);
      return { ok: false, error: `직원 정보 저장 중 오류가 발생했습니다: ${profileErr.message}` };
    }

    revalidatePath("/admin/users");
    return { ok: true };
  } catch (e) {
    console.error("createFieldUser failed:", e);
    return { ok: false, error: e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다" };
  }
}

export async function toggleUserActive(
  userId: string,
  nextActive: boolean
): Promise<ActionResult> {
  try {
    const { userId: adminId } = await requireAdmin();
    if (userId === adminId && !nextActive) {
      return { ok: false, error: "본인 계정은 비활성화할 수 없습니다" };
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from("profiles")
      .update({ is_active: nextActive })
      .eq("id", userId);

    if (error) {
      console.error("toggleUserActive failed:", error);
      return { ok: false, error: `변경 중 오류가 발생했습니다: ${error.message}` };
    }

    revalidatePath("/admin/users");
    return { ok: true };
  } catch (e) {
    console.error("toggleUserActive failed:", e);
    return { ok: false, error: e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다" };
  }
}

// 2026-09-21, Kevin 요청: "현장 작업자라도 pis로 넘어 갈 수 있는 접근권한을
// 관리자가 주거나 막을 수 있도록 권한을 줘. 즉, 어떤 현장 작업자는 imms만
// 어떤 현장 작업자는 imms와 pis 동시에" — 기존 role('admin'|'field') 위에,
// role='field' 계정 개별로 켜고 끌 수 있는 PIS 업무화면 접근 플래그
// (migration 0016). role='admin' 계정에도 값 자체는 저장할 수 있지만 그
// 계정은 이 값과 무관하게 항상 전체 접근이라 의미가 없다(proxy.ts/
// admin/layout.tsx의 실제 게이트 로직 참고).
export async function togglePisAccess(userId: string, nextValue: boolean): Promise<ActionResult> {
  try {
    await requireAdmin();

    const admin = createAdminClient();
    const { error } = await admin.from("profiles").update({ pis_access: nextValue }).eq("id", userId);

    if (error) {
      console.error("togglePisAccess failed:", error);
      return { ok: false, error: `변경 중 오류가 발생했습니다: ${error.message}` };
    }

    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${userId}`);
    return { ok: true };
  } catch (e) {
    console.error("togglePisAccess failed:", e);
    return { ok: false, error: e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다" };
  }
}

// 2026-09-21, Kevin 요청: "사용자계정 비번좀 다시 리셋해줘 김희재 hk0203의
// 비번을 잊어버렸어. 리셋할 수 있는 기능이 없네. 관리자가 리셋할 수 있는
// 기능을 주고" — 지금까지 비밀번호 변경은 본인이 로그인한 상태에서만
// 가능했다(`/account/password`, `changePassword` in actions/auth.ts,
// `supabase.auth.updateUser`). 로그인 자체를 못 하는(비번을 잊은) 사용자를
// 관리자가 대신 구제할 방법이 전혀 없었던 것 — 이 함수가 그 기능이다.
// `admin.auth.admin.updateUserById`는 Supabase Auth Admin API(서비스
// 롤 키로만 호출 가능)라 비밀번호 정책/해싱을 GoTrue가 알아서 처리한다 —
// auth.users를 직접 SQL로 건드리는 것보다 안전하고 정석적인 경로.
const resetPasswordSchema = z.object({
  userId: z.string().uuid(),
  newPassword: z.string().min(6, "비밀번호는 6자 이상이어야 합니다"),
});

export async function resetUserPassword(input: unknown): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요" };
  }

  try {
    await requireAdmin();

    const admin = createAdminClient();
    const { userId, newPassword } = parsed.data;

    const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword });
    if (error) {
      console.error("resetUserPassword failed:", error);
      return { ok: false, error: `비밀번호 초기화 중 오류가 발생했습니다: ${error.message}` };
    }

    revalidatePath(`/admin/users/${userId}`);
    return { ok: true };
  } catch (e) {
    console.error("resetUserPassword failed:", e);
    return { ok: false, error: e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다" };
  }
}
