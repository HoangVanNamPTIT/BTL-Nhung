-- ====================================================
-- AIR QUALITY MONITORING SYSTEM - Database Initialization
-- ====================================================

-- ====================================================
-- CLEAN UP EXISTING DATA (Optional - uncomment if needed)
-- ====================================================
-- DELETE FROM user_devices;
-- DELETE FROM activity_logs;
-- DELETE FROM telemetry_data;
-- DELETE FROM rooms;
-- DELETE FROM mqtt_configs;
-- DELETE FROM devices;
-- DELETE FROM users;

-- ====================================================
-- 1. CREATE USERS (2 users)
-- ====================================================
INSERT INTO users (id, email, password_hash, full_name, role, created_at) VALUES
('user-1', 'a@test.com', '$2b$10$O5F9gYU.ixTJTJ9MIfMWie/Orkcz2xwd7ckSqHCidfHPVAZ33FyBy', 'User A', 'user', NOW()),
('user-2', 'b@test.com', '$2b$10$O5F9gYU.ixTJTJ9MIfMWie/Orkcz2xwd7ckSqHCidfHPVAZ33FyBy', 'User B', 'user', NOW());

-- ====================================================
-- 2. CREATE DEVICES (5 devices with technical names)
-- ====================================================
INSERT INTO devices (id, mac_address, claim_pin, device_name, status, last_connected, created_at) VALUES
('device-1', 'FA:KE:21:B6:9E:30', '654321', 'AQM-Station-Production-Line-A', 'OFFLINE', NULL, NOW()),
('device-2', 'FA:KE:21:B6:9E:31', '654321', 'AQM-Station-Production-Line-B', 'OFFLINE', NULL, NOW()),
('device-3', 'FA:KE:21:B6:9E:32', '654321', 'AQM-Station-Assembly-Area', 'OFFLINE', NULL, NOW()),
('device-4', 'FA:KE:21:B6:9E:33', '654321', 'AQM-Station-Warehouse-Zone', 'OFFLINE', NULL, NOW()),
('device-5', 'FA:KE:21:B6:9E:34', '654321', 'AQM-Station-Quality-Lab', 'OFFLINE', NULL, NOW());

-- ====================================================
-- 3. CREATE ROOMS (2 rooms per device = 10 rooms total)
-- ====================================================
-- Device 1 Rooms
INSERT INTO rooms (id, device_id, room_index, room_name, current_mode, current_fan_status, created_at) VALUES
('room-1-1', 'device-1', 1, 'Inlet Air Quality Zone', 'MANUAL', false, NOW()),
('room-1-2', 'device-1', 2, 'Outlet Air Quality Zone', 'MANUAL', false, NOW());

-- Device 2 Rooms
INSERT INTO rooms (id, device_id, room_index, room_name, current_mode, current_fan_status, created_at) VALUES
('room-2-1', 'device-2', 1, 'Inlet Air Quality Zone', 'MANUAL', false, NOW()),
('room-2-2', 'device-2', 2, 'Outlet Air Quality Zone', 'MANUAL', false, NOW());

-- Device 3 Rooms
INSERT INTO rooms (id, device_id, room_index, room_name, current_mode, current_fan_status, created_at) VALUES
('room-3-1', 'device-3', 1, 'Inlet Air Quality Zone', 'MANUAL', false, NOW()),
('room-3-2', 'device-3', 2, 'Outlet Air Quality Zone', 'MANUAL', false, NOW());

-- Device 4 Rooms
INSERT INTO rooms (id, device_id, room_index, room_name, current_mode, current_fan_status, created_at) VALUES
('room-4-1', 'device-4', 1, 'Inlet Air Quality Zone', 'MANUAL', false, NOW()),
('room-4-2', 'device-4', 2, 'Outlet Air Quality Zone', 'MANUAL', false, NOW());

-- Device 5 Rooms
INSERT INTO rooms (id, device_id, room_index, room_name, current_mode, current_fan_status, created_at) VALUES
('room-5-1', 'device-5', 1, 'Inlet Air Quality Zone', 'MANUAL', false, NOW()),
('room-5-2', 'device-5', 2, 'Outlet Air Quality Zone', 'MANUAL', false, NOW());

-- ====================================================
-- 4. CREATE MQTT CONFIGS (one per device - HiveMQ Cloud)
-- ====================================================
INSERT INTO mqtt_configs (id, device_id, broker_url, port, username, password, created_at) VALUES
('mqtt-1', 'device-1', 'mqtts://21b69e31ed5e4e7c86dbc3dc79814eab.s1.eu.hivemq.cloud', 8883, 'nhung1', '12345Nhung', NOW()),
('mqtt-2', 'device-2', 'mqtts://21b69e31ed5e4e7c86dbc3dc79814eab.s1.eu.hivemq.cloud', 8883, 'nhung1', '12345Nhung', NOW()),
('mqtt-3', 'device-3', 'mqtts://21b69e31ed5e4e7c86dbc3dc79814eab.s1.eu.hivemq.cloud', 8883, 'nhung1', '12345Nhung', NOW()),
('mqtt-4', 'device-4', 'mqtts://21b69e31ed5e4e7c86dbc3dc79814eab.s1.eu.hivemq.cloud', 8883, 'nhung1', '12345Nhung', NOW()),
('mqtt-5', 'device-5', 'mqtts://21b69e31ed5e4e7c86dbc3dc79814eab.s1.eu.hivemq.cloud', 8883, 'nhung1', '12345Nhung', NOW());

-- ====================================================
-- 5. CREATE USER-DEVICE RELATIONSHIPS (Skipped - Leave Empty)
-- ====================================================
-- NOTE: User-Device relationships are left empty
-- Users can claim devices via the application API
-- -- User A (user-1) owns all 5 devices
-- INSERT INTO user_devices (id, user_id, device_id, added_at) VALUES
-- ('ud-1', 'user-1', 'device-1', NOW()),
-- ('ud-2', 'user-1', 'device-2', NOW()),
-- ('ud-3', 'user-1', 'device-3', NOW()),
-- ('ud-4', 'user-1', 'device-4', NOW()),
-- ('ud-5', 'user-1', 'device-5', NOW());
-- 
-- -- User B (user-2) has access to devices 1, 2, and 3
-- INSERT INTO user_devices (id, user_id, device_id, added_at) VALUES
-- ('ud-6', 'user-2', 'device-1', NOW()),
-- ('ud-7', 'user-2', 'device-2', NOW()),
-- ('ud-8', 'user-2', 'device-3', NOW());

-- ====================================================
-- 6. CREATE SAMPLE TELEMETRY DATA (optional - commented out)
-- ====================================================
-- INSERT INTO telemetry_data (room_id, aqi_raw, aqi_level, fan_is_on, timestamp) VALUES
-- ('room-1-1', 45, 'GOOD', false, DATE_SUB(NOW(), INTERVAL 5 MINUTE)),
-- ('room-1-2', 78, 'GOOD', false, DATE_SUB(NOW(), INTERVAL 5 MINUTE)),
-- ('room-2-1', 92, 'MOD', true, DATE_SUB(NOW(), INTERVAL 5 MINUTE)),
-- ('room-2-2', 156, 'MOD', true, DATE_SUB(NOW(), INTERVAL 5 MINUTE)),
-- ('room-3-1', 234, 'BAD', true, DATE_SUB(NOW(), INTERVAL 5 MINUTE)),
-- ('room-3-2', 198, 'BAD', true, DATE_SUB(NOW(), INTERVAL 5 MINUTE)),
-- ('room-4-1', 48, 'GOOD', false, DATE_SUB(NOW(), INTERVAL 5 MINUTE)),
-- ('room-4-2', 89, 'MOD', false, DATE_SUB(NOW(), INTERVAL 5 MINUTE)),
-- ('room-5-1', 127, 'MOD', true, DATE_SUB(NOW(), INTERVAL 5 MINUTE)),
-- ('room-5-2', 91, 'MOD', true, DATE_SUB(NOW(), INTERVAL 5 MINUTE));

-- ====================================================
-- 7. CREATE ACTIVITY LOGS (optional - commented out)
-- ====================================================
-- INSERT INTO activity_logs (user_id, device_id, event_type, description, timestamp) VALUES
-- ('user-1', 'device-1', 'DEVICE_CLAIMED', 'User A claimed AQM-Station-Production-Line-A', DATE_SUB(NOW(), INTERVAL 1 DAY)),
-- ('user-1', 'device-2', 'DEVICE_CLAIMED', 'User A claimed AQM-Station-Production-Line-B', DATE_SUB(NOW(), INTERVAL 1 DAY)),
-- ('user-1', 'device-3', 'DEVICE_CLAIMED', 'User A claimed AQM-Station-Assembly-Area', DATE_SUB(NOW(), INTERVAL 1 DAY)),
-- ('user-1', 'device-4', 'DEVICE_CLAIMED', 'User A claimed AQM-Station-Warehouse-Zone', DATE_SUB(NOW(), INTERVAL 1 DAY)),
-- ('user-1', 'device-5', 'DEVICE_CLAIMED', 'User A claimed AQM-Station-Quality-Lab', DATE_SUB(NOW(), INTERVAL 1 DAY)),
-- ('user-2', 'device-1', 'MODE_CHANGED', 'Changed Inlet Air Quality Zone mode to AUTO', DATE_SUB(NOW(), INTERVAL 30 MINUTE)),
-- ('user-2', 'device-2', 'CONTROL_SENT', 'Control sent to Inlet Air Quality Zone: mode=AUTO, fan=ON', DATE_SUB(NOW(), INTERVAL 15 MINUTE));

-- ====================================================
-- 8. VERIFY DATA
-- ====================================================
SELECT COUNT(*) as total_users FROM users;
SELECT COUNT(*) as total_devices FROM devices;
SELECT COUNT(*) as total_rooms FROM rooms;
SELECT COUNT(*) as total_user_devices FROM user_devices;
SELECT COUNT(*) as total_mqtt_configs FROM mqtt_configs;
SELECT COUNT(*) as total_telemetry FROM telemetry_data;
SELECT COUNT(*) as total_activity_logs FROM activity_logs;

-- ====================================================
-- Display Summary
-- ====================================================
SELECT 'Data Initialization Complete!' as Status;
SELECT CONCAT(COUNT(*), ' users created') FROM users;
SELECT CONCAT(COUNT(*), ' devices created') FROM devices;
SELECT CONCAT(COUNT(*), ' rooms created') FROM rooms;
