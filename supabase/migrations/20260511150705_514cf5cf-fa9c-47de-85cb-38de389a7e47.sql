
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Auto-grant admin role to FIRST signup, none to others (safer than open admin signup)
CREATE OR REPLACE FUNCTION public.grant_first_user_admin()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created_grant_admin
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.grant_first_user_admin();

-- Generic updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- Orders
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_order_id TEXT UNIQUE NOT NULL,
  shopify_order_number TEXT,
  customer_name TEXT,
  phone TEXT,
  email TEXT,
  total_price NUMERIC(12,2),
  currency TEXT,
  financial_status TEXT,
  fulfillment_status TEXT,
  payment_type TEXT,
  shipping_address JSONB,
  line_items JSONB,
  notifications_paused BOOLEAN NOT NULL DEFAULT false,
  shopify_created_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX orders_phone_idx ON public.orders(phone);
CREATE INDEX orders_created_idx ON public.orders(shopify_created_at DESC);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin full orders" ON public.orders FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Fulfillments
CREATE TABLE public.fulfillments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  shopify_fulfillment_id TEXT UNIQUE,
  tracking_number TEXT,
  tracking_company TEXT,
  tracking_url TEXT,
  current_status TEXT,
  last_notified_status TEXT,
  shipment_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER fulfillments_updated_at BEFORE UPDATE ON public.fulfillments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX fulfillments_order_idx ON public.fulfillments(order_id);
ALTER TABLE public.fulfillments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin full fulfillments" ON public.fulfillments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Message templates
CREATE TABLE public.message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  body TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  auto_send BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER message_templates_updated_at BEFORE UPDATE ON public.message_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin full templates" ON public.message_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.message_templates (event, label, body, auto_send) VALUES
  ('order_placed', 'Order Placed', E'Hi {{customer_name}}! 👋\n\nYour order #{{order_number}} has been placed successfully.\nTotal: {{currency}} {{total}}\n\nWe will notify you once it ships. Thank you for shopping with us!', true),
  ('shipped', 'Shipped', E'Good news {{customer_name}}! 📦\n\nYour order #{{order_number}} has been shipped via {{tracking_company}}.\nTracking ID: {{tracking_number}}\nTrack here: {{tracking_url}}', true),
  ('in_transit', 'In Transit', E'{{customer_name}}, your order #{{order_number}} is on the way! 🚚\nTrack: {{tracking_url}}', false),
  ('out_for_delivery', 'Out for Delivery', E'🚚 Your order #{{order_number}} is out for delivery today, {{customer_name}}!\nPlease keep your phone reachable.', true),
  ('delivered', 'Delivered', E'✅ Your order #{{order_number}} has been delivered, {{customer_name}}!\n\nThank you for choosing us. We''d love your feedback!', true),
  ('delayed', 'Delayed', E'Hi {{customer_name}}, your order #{{order_number}} is taking a bit longer than expected. We are working on it. Sorry for the inconvenience!', false),
  ('returned', 'Returned', E'Your order #{{order_number}} has been returned, {{customer_name}}. If this was unexpected, please contact us.', false),
  ('failure', 'Delivery Failed', E'Hi {{customer_name}}, our courier could not deliver order #{{order_number}}. They will reattempt soon. Track: {{tracking_url}}', false);

-- Message jobs (queue)
CREATE TABLE public.message_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  event TEXT,
  phone TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued', -- queued, draft, sending, sent, failed, cancelled
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  wa_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER message_jobs_updated_at BEFORE UPDATE ON public.message_jobs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX message_jobs_status_sched_idx ON public.message_jobs(status, scheduled_for);
CREATE INDEX message_jobs_order_idx ON public.message_jobs(order_id);
ALTER TABLE public.message_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin full jobs" ON public.message_jobs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Settings (single row)
CREATE TABLE public.app_settings (
  id INT PRIMARY KEY DEFAULT 1,
  daily_send_limit INT NOT NULL DEFAULT 200,
  send_window_start TIME NOT NULL DEFAULT '09:00',
  send_window_end TIME NOT NULL DEFAULT '21:00',
  min_delay_sec INT NOT NULL DEFAULT 8,
  max_delay_sec INT NOT NULL DEFAULT 25,
  opt_out_keyword TEXT NOT NULL DEFAULT 'STOP',
  bridge_secret TEXT NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  shopify_webhook_secret TEXT NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (id = 1)
);
INSERT INTO public.app_settings (id) VALUES (1);
CREATE TRIGGER app_settings_updated_at BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read settings" ON public.app_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin update settings" ON public.app_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Bridge session
CREATE TABLE public.bridge_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_name TEXT UNIQUE NOT NULL DEFAULT 'default',
  status TEXT NOT NULL DEFAULT 'offline', -- offline, qr, online
  qr_code TEXT,
  last_seen_at TIMESTAMPTZ,
  sent_today INT NOT NULL DEFAULT 0,
  sent_today_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER bridge_sessions_updated_at BEFORE UPDATE ON public.bridge_sessions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
INSERT INTO public.bridge_sessions (session_name) VALUES ('default');
ALTER TABLE public.bridge_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin full bridge" ON public.bridge_sessions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Opt-outs
CREATE TABLE public.opt_outs (
  phone TEXT PRIMARY KEY,
  opted_out_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.opt_outs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin full optouts" ON public.opt_outs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
