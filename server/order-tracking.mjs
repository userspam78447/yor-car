export const trackingSQL=`
CREATE TABLE IF NOT EXISTS order_tracking(
 order_id INTEGER PRIMARY KEY REFERENCES orders(id),
 order_number TEXT NOT NULL UNIQUE DEFAULT ('#P'||lower(hex(randomblob(6)))),
 stage TEXT NOT NULL DEFAULT 'RECEBIDO' CHECK(stage IN ('RECEBIDO','CONFIRMADO','EM_PREPARO','PRONTO'))
);
CREATE TRIGGER IF NOT EXISTS track_new_order AFTER INSERT ON orders BEGIN
 INSERT INTO order_tracking(order_id) VALUES(NEW.id);
END;
INSERT INTO order_tracking(order_id) SELECT id FROM orders WHERE id NOT IN (SELECT order_id FROM order_tracking);
`;
