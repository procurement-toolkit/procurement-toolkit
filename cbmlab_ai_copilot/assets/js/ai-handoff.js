/**
 * CBM Lab — AI Handoff 모듈
 * 계산기 페이지 <-> AI 코파일럿 페이지 간 데이터 전달 담당.
 * 모든 저장은 localStorage에서만 이루어짐 (서버 전송 없음).
 *
 * 사용법 (계산기 페이지 쪽):
 *   <script src="/assets/js/ai-handoff.js"></script>
 *   <script>
 *     document.getElementById('ai-email-btn').addEventListener('click', () => {
 *       CBMLabHandoff.save('fob-cif', summaryText, {
 *         incoterm: 'FOB', unitCost: 3.2, totalLandedCost: 12450, supplierCountry: 'CN'
 *       });
 *       window.location.href = '/email-copilot.html';
 *     });
 *   </script>
 *
 * 사용법 (코파일럿 페이지 쪽):
 *   const ctx = CBMLabHandoff.read(); // null 이거나 { tool, summary, data, timestamp }
 */
(function (global) {
  const STORAGE_KEY = 'cbmlab:ai_handoff';
  const MAX_AGE_MS = 30 * 60 * 1000; // 30분 지나면 만료 처리

  function save(tool, summary, data) {
    const payload = {
      version: 1,
      tool,
      timestamp: new Date().toISOString(),
      summary,
      data: data || {},
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      return true;
    } catch (e) {
      console.warn('[CBMLabHandoff] localStorage 저장 실패:', e);
      return false;
    }
  }

  function read() {
    let raw;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
    if (!raw) return null;

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (e) {
      return null;
    }

    if (!payload || !payload.timestamp) return null;

    const age = Date.now() - new Date(payload.timestamp).getTime();
    if (age > MAX_AGE_MS) {
      clear();
      return null;
    }
    return payload;
  }

  function clear() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      /* noop */
    }
  }

  // 라이선스 키도 같은 모듈에서 관리 (별도 로그인 시스템 없이 클라이언트에 보관)
  const LICENSE_KEY_STORAGE = 'cbmlab:license_key';

  function saveLicenseKey(key) {
    try {
      localStorage.setItem(LICENSE_KEY_STORAGE, key.trim());
      return true;
    } catch (e) {
      return false;
    }
  }

  function readLicenseKey() {
    try {
      return localStorage.getItem(LICENSE_KEY_STORAGE) || null;
    } catch (e) {
      return null;
    }
  }

  global.CBMLabHandoff = { save, read, clear, saveLicenseKey, readLicenseKey };
})(window);
