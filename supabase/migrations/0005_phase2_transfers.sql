-- Phase 2: 창고이동(MOV) / 택배발송(SHP) / 반납(RET)
--
-- MOV and RET reuse the existing locations master (warehouse/factory codes).
-- SHP always leaves the system through a single generic external placeholder
-- location ("EXT") — the real destination (customer/recipient, carrier,
-- tracking number) is captured on the linked shipments row instead, since
-- individual customer addresses aren't part of the E-Count warehouse master.
insert into locations (code, name, location_type) values
  ('EXT', '외부(택배발송처)', 'external')
on conflict (code) do nothing;
