-- Ledger guards and derived views.
--
-- Everything here enforces at the database level what §00 and §04 state as
-- rules. A rule that lives only in application code is a rule that a future
-- migration script, a psql session, or a tired evening will break.

-- §04 asks for pgcrypto explicitly. gen_random_uuid() has been core since
-- Postgres 13, so the extension is belt-and-braces — non-fatal when a build
-- does not ship it, which is what lets the test harness run this file verbatim
-- rather than a doctored copy.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgcrypto unavailable; continuing (gen_random_uuid is built in)';
END $$;
--> statement-breakpoint

-- ===========================================================================
-- §00 rule 1 — movements is append-only.
-- ===========================================================================
--
-- DELETE is refused outright. UPDATE is refused for every column that decides
-- what was billed: type, quantity, item, account, dates, rates. Photos and
-- signatures are the one exception, because §07.1 queues binaries separately
-- and a gate-pass photo taken offline lands after the movement row syncs.
CREATE OR REPLACE FUNCTION forbid_movement_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'movements is append-only: delete rejected for movement %. Record a REVERSAL instead.',
      OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF ROW(
       NEW.org_id, NEW.account_id, NEW.item_id, NEW.type, NEW.qty,
       NEW.rate_snapshot, NEW.replacement_snapshot, NEW.manual_charge,
       NEW.moved_at, NEW.reverses_id, NEW.client_uuid, NEW.created_by,
       NEW.created_at, NEW.gate_pass_no, NEW.remarks, NEW.device_id
     ) IS DISTINCT FROM ROW(
       OLD.org_id, OLD.account_id, OLD.item_id, OLD.type, OLD.qty,
       OLD.rate_snapshot, OLD.replacement_snapshot, OLD.manual_charge,
       OLD.moved_at, OLD.reverses_id, OLD.client_uuid, OLD.created_by,
       OLD.created_at, OLD.gate_pass_no, OLD.remarks, OLD.device_id
     ) THEN
    RAISE EXCEPTION
      'movements is append-only: update rejected for movement %. Record a REVERSAL instead.',
      OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER movements_append_only
  BEFORE UPDATE OR DELETE ON movements
  FOR EACH ROW EXECUTE FUNCTION forbid_movement_mutation();
--> statement-breakpoint

-- ===========================================================================
-- §02 — a bill is immutable once issued.
-- ===========================================================================
CREATE OR REPLACE FUNCTION forbid_bill_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'bills are immutable: % rejected for bill %. Raise a credit adjustment and issue a new bill.',
    TG_OP, OLD.id
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER bills_immutable
  BEFORE UPDATE OR DELETE ON bills
  FOR EACH ROW EXECUTE FUNCTION forbid_bill_mutation();
--> statement-breakpoint

-- ===========================================================================
-- §07.3 — server_seq must advance on every change, not only on insert.
-- ===========================================================================
--
-- The offline client pulls `where server_seq > cursor`. Without this an edited
-- customer keeps its original sequence and every device that already synced
-- past it silently never sees the change.
CREATE OR REPLACE FUNCTION bump_server_seq() RETURNS trigger AS $$
BEGIN
  NEW.server_seq := nextval('sync_seq');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER customers_bump_seq BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION bump_server_seq();
--> statement-breakpoint
CREATE TRIGGER items_bump_seq BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION bump_server_seq();
--> statement-breakpoint
CREATE TRIGGER accounts_bump_seq BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION bump_server_seq();
--> statement-breakpoint
CREATE TRIGGER payments_bump_seq BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION bump_server_seq();
--> statement-breakpoint
CREATE TRIGGER adjustments_bump_seq BEFORE UPDATE ON adjustments
  FOR EACH ROW EXECUTE FUNCTION bump_server_seq();
--> statement-breakpoint

-- ===========================================================================
-- §04 — live stock, derived from the ledger. Never a stored counter.
-- ===========================================================================
--
-- qty_out    units currently with customers
-- qty_lost   units written off — gone, so they reduce effective owned stock
-- qty_available = owned - lost - out
--
-- Reversed movements are excluded, as are the REVERSAL rows themselves.
CREATE VIEW v_item_stock AS
SELECT
  i.id,
  i.org_id,
  i.name,
  i.code,
  i.unit,
  i.qty_owned,
  COALESCE(SUM(
    CASE m.type
      WHEN 'ISSUE'          THEN  m.qty
      WHEN 'RETURN'         THEN -m.qty
      WHEN 'RETURN_DAMAGED' THEN -m.qty
      WHEN 'LOST'           THEN -m.qty
      ELSE 0
    END
  ), 0)::int AS qty_out,
  COALESCE(SUM(
    CASE WHEN m.type = 'LOST' THEN m.qty ELSE 0 END
  ), 0)::int AS qty_lost,
  (
    i.qty_owned
    - COALESCE(SUM(CASE WHEN m.type = 'LOST' THEN m.qty ELSE 0 END), 0)
    - COALESCE(SUM(
        CASE m.type
          WHEN 'ISSUE'          THEN  m.qty
          WHEN 'RETURN'         THEN -m.qty
          WHEN 'RETURN_DAMAGED' THEN -m.qty
          WHEN 'LOST'           THEN -m.qty
          ELSE 0
        END
      ), 0)
  )::int AS qty_available
FROM items i
LEFT JOIN movements m
  ON m.item_id = i.id
 AND m.type <> 'REVERSAL'
 AND NOT EXISTS (SELECT 1 FROM movements r WHERE r.reverses_id = m.id)
GROUP BY i.id;
