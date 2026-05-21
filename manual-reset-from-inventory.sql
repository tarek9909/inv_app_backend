-- Manual destructive reset equivalent to backend/src/migrations/20260521000000-reset-schema-from-inventory-sql.js
-- WARNING: this drops existing application tables and reloads backend/inventory.sql data.

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `login_events`;
DROP TABLE IF EXISTS `password_reset_tokens`;
DROP TABLE IF EXISTS `attachments`;
DROP TABLE IF EXISTS `notifications`;
DROP TABLE IF EXISTS `stock_movement_batches`;
DROP TABLE IF EXISTS `inventory_batches`;
DROP TABLE IF EXISTS `stock_reservations`;
DROP TABLE IF EXISTS `location_monthly_targets`;
DROP TABLE IF EXISTS `location_commission_rules`;
DROP TABLE IF EXISTS `driver_location_assignments`;
DROP TABLE IF EXISTS `locations`;
DROP TABLE IF EXISTS `stock_request_item_confirmations`;
DROP TABLE IF EXISTS `stock_request_prints`;
DROP TABLE IF EXISTS `settings`;
DROP TABLE IF EXISTS `role_permissions`;
DROP TABLE IF EXISTS `permissions`;
DROP TABLE IF EXISTS `payments`;
DROP TABLE IF EXISTS `stock_request_items`;
DROP TABLE IF EXISTS `stock_requests`;
DROP TABLE IF EXISTS `stock_movements`;
DROP TABLE IF EXISTS `stock_entries`;
DROP TABLE IF EXISTS `purchase_order_items`;
DROP TABLE IF EXISTS `purchase_orders`;
DROP TABLE IF EXISTS `items`;
DROP TABLE IF EXISTS `item_categories`;
DROP TABLE IF EXISTS `suppliers`;
DROP TABLE IF EXISTS `drivers`;
DROP TABLE IF EXISTS `audit_logs`;
DROP TABLE IF EXISTS `user_roles`;
DROP TABLE IF EXISTS `users`;
DROP TABLE IF EXISTS `roles`;
SET FOREIGN_KEY_CHECKS = 1;

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";

SET time_zone = "+00:00";

CREATE TABLE `audit_logs` (
  `id` bigint UNSIGNED NOT NULL,
  `user_id` bigint UNSIGNED DEFAULT NULL,
  `action` varchar(150) COLLATE utf8mb4_general_ci NOT NULL,
  `module` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `record_id` bigint UNSIGNED DEFAULT NULL,
  `old_data` json DEFAULT NULL,
  `new_data` json DEFAULT NULL,
  `ip_address` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `user_agent` text COLLATE utf8mb4_general_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `audit_logs` (`id`, `user_id`, `action`, `module`, `record_id`, `old_data`, `new_data`, `ip_address`, `user_agent`, `created_at`) VALUES
(1, 1, 'create', 'items', 3, NULL, '{\"id\": 3, \"name\": \"asd\", \"unit\": \"piece\", \"status\": \"active\", \"created_at\": \"2026-05-18T12:42:40.219Z\", \"created_by\": 1, \"updated_at\": \"2026-05-18T12:42:40.219Z\", \"current_stock\": 0, \"minimum_stock\": 0, \"selling_price\": 0, \"purchase_price\": 0}', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36', '2026-05-18 12:42:40'),
(2, 1, 'create', 'drivers', 2, NULL, '{\"id\": 2, \"phone\": \"123\", \"status\": \"active\", \"full_name\": \"asd\", \"created_at\": \"2026-05-18T12:42:52.141Z\", \"created_by\": 1, \"updated_at\": \"2026-05-18T12:42:52.141Z\"}', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36', '2026-05-18 12:42:52'),
(3, 1, 'create', 'stock_requests', 1, NULL, '{\"items\": [{\"item_id\": 3, \"quantity\": 100, \"unit_price\": 12}], \"notes\": \"\", \"driver_id\": 1, \"request_date\": \"2026-05-18T00:00:00.000Z\", \"request_type\": \"stock_out\", \"discount_amount\": 0}', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36', '2026-05-18 13:19:47');

CREATE TABLE `drivers` (
  `id` bigint UNSIGNED NOT NULL,
  `user_id` bigint UNSIGNED DEFAULT NULL,
  `full_name` varchar(150) COLLATE utf8mb4_general_ci NOT NULL,
  `phone` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `address` text COLLATE utf8mb4_general_ci,
  `id_number` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `vehicle_type` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `vehicle_plate_number` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_general_ci,
  `status` enum('active','inactive','blocked') COLLATE utf8mb4_general_ci DEFAULT 'active',
  `created_by` bigint UNSIGNED DEFAULT NULL,
  `updated_by` bigint UNSIGNED DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `drivers` (`id`, `user_id`, `full_name`, `phone`, `address`, `id_number`, `vehicle_type`, `vehicle_plate_number`, `notes`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`) VALUES
(1, 4, 'Ahmad Driver', '03000000', 'Lebanon', 'ID-001', 'Motorcycle', 'PLATE-001', NULL, 'active', 3, NULL, '2026-05-18 12:32:27', '2026-05-20 20:59:40'),
(2, NULL, 'asd', '123', NULL, NULL, NULL, NULL, NULL, 'active', 1, NULL, '2026-05-18 12:42:52', '2026-05-18 12:42:52');

CREATE TABLE `items` (
  `id` bigint UNSIGNED NOT NULL,
  `category_id` bigint UNSIGNED DEFAULT NULL,
  `supplier_id` bigint UNSIGNED DEFAULT NULL,
  `name` varchar(150) COLLATE utf8mb4_general_ci NOT NULL,
  `sku` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_general_ci,
  `unit` varchar(50) COLLATE utf8mb4_general_ci DEFAULT 'piece',
  `purchase_price` decimal(12,2) DEFAULT '0.00',
  `selling_price` decimal(12,2) DEFAULT '0.00',
  `current_stock` decimal(12,2) DEFAULT '0.00',
  `minimum_stock` decimal(12,2) DEFAULT '0.00',
  `status` enum('active','inactive') COLLATE utf8mb4_general_ci DEFAULT 'active',
  `created_by` bigint UNSIGNED DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `items` (`id`, `category_id`, `supplier_id`, `name`, `sku`, `description`, `unit`, `purchase_price`, `selling_price`, `current_stock`, `minimum_stock`, `status`, `created_by`, `created_at`, `updated_at`) VALUES
(1, 2, 1, 'Water Box', 'WATER-BOX-001', 'Box of water bottles', 'box', 2.00, 3.00, 100.00, 10.00, 'active', 1, '2026-05-18 12:32:27', '2026-05-18 12:32:27'),
(2, 2, 1, 'Juice Box', 'JUICE-BOX-001', 'Box of juice bottles', 'box', 4.00, 6.00, 50.00, 5.00, 'active', 1, '2026-05-18 12:32:27', '2026-05-18 12:32:27'),
(3, NULL, NULL, 'asd', NULL, NULL, 'piece', 0.00, 0.00, 0.00, 0.00, 'active', 1, '2026-05-18 12:42:40', '2026-05-18 12:42:40');

CREATE TABLE `item_categories` (
  `id` bigint UNSIGNED NOT NULL,
  `name` varchar(150) COLLATE utf8mb4_general_ci NOT NULL,
  `description` text COLLATE utf8mb4_general_ci,
  `status` enum('active','inactive') COLLATE utf8mb4_general_ci DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `item_categories` (`id`, `name`, `description`, `status`, `created_at`, `updated_at`) VALUES
(1, 'General Items', 'Default category for stock items', 'active', '2026-05-18 12:32:27', '2026-05-18 12:32:27'),
(2, 'Drinks', 'Drink products', 'active', '2026-05-18 12:32:27', '2026-05-18 12:32:27'),
(3, 'Food', 'Food products', 'active', '2026-05-18 12:32:27', '2026-05-18 12:32:27');

CREATE TABLE `payments` (
  `id` bigint UNSIGNED NOT NULL,
  `stock_request_id` bigint UNSIGNED NOT NULL,
  `driver_id` bigint UNSIGNED NOT NULL,
  `payment_number` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `payment_method` enum('cash','bank_transfer','other') COLLATE utf8mb4_general_ci DEFAULT 'cash',
  `payment_date` datetime NOT NULL,
  `notes` text COLLATE utf8mb4_general_ci,
  `received_by` bigint UNSIGNED DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `purchase_orders` (
  `id` bigint UNSIGNED NOT NULL,
  `po_number` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `supplier_id` bigint UNSIGNED NOT NULL,
  `order_date` date NOT NULL,
  `expected_delivery_date` date DEFAULT NULL,
  `received_date` date DEFAULT NULL,
  `status` enum('draft','pending','partially_received','received','cancelled') COLLATE utf8mb4_general_ci DEFAULT 'pending',
  `subtotal` decimal(12,2) DEFAULT '0.00',
  `discount_amount` decimal(12,2) DEFAULT '0.00',
  `tax_amount` decimal(12,2) DEFAULT '0.00',
  `total_amount` decimal(12,2) DEFAULT '0.00',
  `notes` text COLLATE utf8mb4_general_ci,
  `created_by` bigint UNSIGNED DEFAULT NULL,
  `approved_by` bigint UNSIGNED DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `purchase_order_items` (
  `id` bigint UNSIGNED NOT NULL,
  `purchase_order_id` bigint UNSIGNED NOT NULL,
  `item_id` bigint UNSIGNED NOT NULL,
  `ordered_quantity` decimal(12,2) NOT NULL,
  `received_quantity` decimal(12,2) DEFAULT '0.00',
  `unit_cost` decimal(12,2) DEFAULT '0.00',
  `total_cost` decimal(12,2) GENERATED ALWAYS AS ((`ordered_quantity` * `unit_cost`)) STORED,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `roles` (
  `id` bigint UNSIGNED NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `code` varchar(50) COLLATE utf8mb4_general_ci NOT NULL,
  `description` text COLLATE utf8mb4_general_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `roles` (`id`, `name`, `code`, `description`, `created_at`, `updated_at`) VALUES
(1, 'Admin', 'admin', 'Full access to the whole system', '2026-05-18 12:32:27', '2026-05-18 12:32:27'),
(2, 'Inventory', 'inventory', 'Can manage stock, stock movements, and purchase orders', '2026-05-18 12:32:27', '2026-05-18 12:32:27'),
(3, 'Accountant', 'accountant', 'Can manage drivers, stock deduction requests, and payments', '2026-05-18 12:32:27', '2026-05-18 12:32:27'),
(4, 'Driver', 'driver', 'Can access the driver portal and assigned stock requests', '2026-05-20 20:57:43', '2026-05-20 20:59:40');

CREATE TABLE `stock_entries` (
  `id` bigint UNSIGNED NOT NULL,
  `item_id` bigint UNSIGNED NOT NULL,
  `supplier_id` bigint UNSIGNED DEFAULT NULL,
  `quantity` decimal(12,2) NOT NULL,
  `unit_cost` decimal(12,2) DEFAULT '0.00',
  `total_cost` decimal(12,2) GENERATED ALWAYS AS ((`quantity` * `unit_cost`)) STORED,
  `entry_date` date NOT NULL,
  `notes` text COLLATE utf8mb4_general_ci,
  `created_by` bigint UNSIGNED DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `stock_movements` (
  `id` bigint UNSIGNED NOT NULL,
  `item_id` bigint UNSIGNED NOT NULL,
  `movement_type` enum('stock_in','stock_out','adjustment_in','adjustment_out','purchase_received','driver_request','driver_return','cancelled_request') COLLATE utf8mb4_general_ci NOT NULL,
  `reference_type` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `reference_id` bigint UNSIGNED DEFAULT NULL,
  `quantity` decimal(12,2) NOT NULL,
  `stock_before` decimal(12,2) NOT NULL,
  `stock_after` decimal(12,2) NOT NULL,
  `notes` text COLLATE utf8mb4_general_ci,
  `created_by` bigint UNSIGNED DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `stock_requests` (
  `id` bigint UNSIGNED NOT NULL,
  `request_number` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `driver_id` bigint UNSIGNED NOT NULL,
  `request_date` date NOT NULL,
  `request_type` enum('stock_out','stock_return') COLLATE utf8mb4_general_ci DEFAULT 'stock_out',
  `request_status` enum('draft','pending','approved','completed','cancelled') COLLATE utf8mb4_general_ci DEFAULT 'pending',
  `payment_status` enum('pending','partially_paid','paid','cancelled') COLLATE utf8mb4_general_ci DEFAULT 'pending',
  `subtotal` decimal(12,2) DEFAULT '0.00',
  `discount_amount` decimal(12,2) DEFAULT '0.00',
  `total_amount` decimal(12,2) DEFAULT '0.00',
  `paid_amount` decimal(12,2) DEFAULT '0.00',
  `remaining_amount` decimal(12,2) DEFAULT '0.00',
  `notes` text COLLATE utf8mb4_general_ci,
  `created_by` bigint UNSIGNED DEFAULT NULL,
  `approved_by` bigint UNSIGNED DEFAULT NULL,
  `completed_by` bigint UNSIGNED DEFAULT NULL,
  `paid_by` bigint UNSIGNED DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `paid_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `stock_requests` (`id`, `request_number`, `driver_id`, `request_date`, `request_type`, `request_status`, `payment_status`, `subtotal`, `discount_amount`, `total_amount`, `paid_amount`, `remaining_amount`, `notes`, `created_by`, `approved_by`, `completed_by`, `paid_by`, `approved_at`, `completed_at`, `paid_at`, `created_at`, `updated_at`) VALUES
(1, 'REQ-20260518131947-7443', 1, '2026-05-18', 'stock_out', 'pending', 'pending', 1200.00, 0.00, 1200.00, 0.00, 1200.00, '', 1, NULL, NULL, NULL, NULL, NULL, NULL, '2026-05-18 13:19:47', '2026-05-18 13:19:47');

CREATE TABLE `stock_request_items` (
  `id` bigint UNSIGNED NOT NULL,
  `stock_request_id` bigint UNSIGNED NOT NULL,
  `item_id` bigint UNSIGNED NOT NULL,
  `quantity` decimal(12,2) NOT NULL,
  `unit_price` decimal(12,2) NOT NULL,
  `total_price` decimal(12,2) GENERATED ALWAYS AS ((`quantity` * `unit_price`)) STORED,
  `notes` text COLLATE utf8mb4_general_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `stock_request_items` (`id`, `stock_request_id`, `item_id`, `quantity`, `unit_price`, `notes`, `created_at`) VALUES
(1, 1, 3, 100.00, 12.00, NULL, '2026-05-18 13:19:47');

CREATE TABLE `suppliers` (
  `id` bigint UNSIGNED NOT NULL,
  `name` varchar(150) COLLATE utf8mb4_general_ci NOT NULL,
  `phone` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `email` varchar(150) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `address` text COLLATE utf8mb4_general_ci,
  `notes` text COLLATE utf8mb4_general_ci,
  `status` enum('active','inactive') COLLATE utf8mb4_general_ci DEFAULT 'active',
  `created_by` bigint UNSIGNED DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `suppliers` (`id`, `name`, `phone`, `email`, `address`, `notes`, `status`, `created_by`, `created_at`, `updated_at`) VALUES
(1, 'Default Supplier', NULL, NULL, NULL, NULL, 'active', 1, '2026-05-18 12:32:27', '2026-05-18 12:32:27');

CREATE TABLE `users` (
  `id` bigint UNSIGNED NOT NULL,
  `full_name` varchar(150) COLLATE utf8mb4_general_ci NOT NULL,
  `email` varchar(150) COLLATE utf8mb4_general_ci NOT NULL,
  `phone` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `password` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `status` enum('active','inactive','blocked') COLLATE utf8mb4_general_ci DEFAULT 'active',
  `last_login_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `users` (`id`, `full_name`, `email`, `phone`, `password`, `status`, `last_login_at`, `created_at`, `updated_at`) VALUES
(1, 'System Admin', 'admin@example.com', NULL, '$2a$10$xRpBJLqyWz248qwKll5ku.rTPMNzm6yUzPeWLc91/fBXzYPI5Q0i2', 'active', '2026-05-19 17:07:49', '2026-05-18 12:32:27', '2026-05-19 17:07:49'),
(2, 'Inventory User', 'inventory@example.com', NULL, '$2y$10$replace_with_hashed_password', 'active', NULL, '2026-05-18 12:32:27', '2026-05-18 12:32:27'),
(3, 'Accountant User', 'accountant@example.com', NULL, '$2y$10$replace_with_hashed_password', 'active', NULL, '2026-05-18 12:32:27', '2026-05-18 12:32:27'),
(4, 'Ahmad Driver', 'driver@example.com', '03000000', '$2a$10$vDQgvVHEhr1kYidXSEQU3OKDksWRfFD3YPE/fqcDK5n8UyT3pKXVO', 'active', NULL, '2026-05-20 20:59:40', '2026-05-20 20:59:40');

CREATE TABLE `user_roles` (
  `id` bigint UNSIGNED NOT NULL,
  `user_id` bigint UNSIGNED NOT NULL,
  `role_id` bigint UNSIGNED NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `user_roles` (`id`, `user_id`, `role_id`, `created_at`) VALUES
(1, 1, 1, '2026-05-20 20:54:52'),
(2, 2, 2, '2026-05-20 20:54:52'),
(3, 3, 3, '2026-05-20 20:54:52'),
(4, 4, 4, '2026-05-20 20:59:40');

ALTER TABLE `audit_logs`
  ADD KEY `fk_audit_logs_user` (`user_id`);

ALTER TABLE `drivers`
  ADD UNIQUE KEY `uq_drivers_user` (`user_id`),
  ADD KEY `fk_drivers_created_by` (`created_by`),
  ADD KEY `fk_drivers_updated_by` (`updated_by`);

ALTER TABLE `items`
  ADD UNIQUE KEY `sku` (`sku`),
  ADD KEY `fk_items_category` (`category_id`),
  ADD KEY `fk_items_supplier` (`supplier_id`),
  ADD KEY `fk_items_created_by` (`created_by`);

ALTER TABLE `payments`
  ADD UNIQUE KEY `payment_number` (`payment_number`),
  ADD KEY `fk_payments_stock_request` (`stock_request_id`),
  ADD KEY `fk_payments_driver` (`driver_id`),
  ADD KEY `fk_payments_received_by` (`received_by`);

ALTER TABLE `purchase_orders`
  ADD UNIQUE KEY `po_number` (`po_number`),
  ADD KEY `fk_purchase_orders_supplier` (`supplier_id`),
  ADD KEY `fk_purchase_orders_created_by` (`created_by`),
  ADD KEY `fk_purchase_orders_approved_by` (`approved_by`);

ALTER TABLE `purchase_order_items`
  ADD KEY `fk_purchase_order_items_order` (`purchase_order_id`),
  ADD KEY `fk_purchase_order_items_item` (`item_id`);

ALTER TABLE `roles`
  ADD UNIQUE KEY `name` (`name`),
  ADD UNIQUE KEY `code` (`code`);

ALTER TABLE `stock_entries`
  ADD KEY `fk_stock_entries_item` (`item_id`),
  ADD KEY `fk_stock_entries_supplier` (`supplier_id`),
  ADD KEY `fk_stock_entries_created_by` (`created_by`);

ALTER TABLE `stock_movements`
  ADD KEY `fk_stock_movements_item` (`item_id`),
  ADD KEY `fk_stock_movements_created_by` (`created_by`);

ALTER TABLE `stock_requests`
  ADD UNIQUE KEY `request_number` (`request_number`),
  ADD KEY `fk_stock_requests_driver` (`driver_id`),
  ADD KEY `fk_stock_requests_created_by` (`created_by`),
  ADD KEY `fk_stock_requests_approved_by` (`approved_by`),
  ADD KEY `fk_stock_requests_completed_by` (`completed_by`),
  ADD KEY `fk_stock_requests_paid_by` (`paid_by`);

ALTER TABLE `stock_request_items`
  ADD KEY `fk_stock_request_items_request` (`stock_request_id`),
  ADD KEY `fk_stock_request_items_item` (`item_id`);

ALTER TABLE `suppliers`
  ADD KEY `fk_suppliers_created_by` (`created_by`);

ALTER TABLE `users`
  ADD UNIQUE KEY `email` (`email`);

ALTER TABLE `user_roles`
  ADD UNIQUE KEY `uq_user_roles_user` (`user_id`),
  ADD KEY `idx_user_roles_role` (`role_id`);

ALTER TABLE `audit_logs`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

ALTER TABLE `drivers`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

ALTER TABLE `items`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

ALTER TABLE `item_categories`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

ALTER TABLE `payments`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `purchase_orders`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `purchase_order_items`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `roles`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

ALTER TABLE `stock_entries`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `stock_movements`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `stock_requests`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

ALTER TABLE `stock_request_items`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

ALTER TABLE `suppliers`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

ALTER TABLE `users`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

ALTER TABLE `user_roles`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

ALTER TABLE `audit_logs`
  ADD CONSTRAINT `fk_audit_logs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `drivers`
  ADD CONSTRAINT `fk_drivers_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_drivers_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_drivers_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `items`
  ADD CONSTRAINT `fk_items_category` FOREIGN KEY (`category_id`) REFERENCES `item_categories` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_items_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_items_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `payments`
  ADD CONSTRAINT `fk_payments_driver` FOREIGN KEY (`driver_id`) REFERENCES `drivers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_payments_received_by` FOREIGN KEY (`received_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_payments_stock_request` FOREIGN KEY (`stock_request_id`) REFERENCES `stock_requests` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `purchase_orders`
  ADD CONSTRAINT `fk_purchase_orders_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_purchase_orders_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_purchase_orders_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `purchase_order_items`
  ADD CONSTRAINT `fk_purchase_order_items_item` FOREIGN KEY (`item_id`) REFERENCES `items` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_purchase_order_items_order` FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `stock_entries`
  ADD CONSTRAINT `fk_stock_entries_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_stock_entries_item` FOREIGN KEY (`item_id`) REFERENCES `items` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_stock_entries_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `stock_movements`
  ADD CONSTRAINT `fk_stock_movements_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_stock_movements_item` FOREIGN KEY (`item_id`) REFERENCES `items` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `stock_requests`
  ADD CONSTRAINT `fk_stock_requests_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_stock_requests_completed_by` FOREIGN KEY (`completed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_stock_requests_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_stock_requests_driver` FOREIGN KEY (`driver_id`) REFERENCES `drivers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_stock_requests_paid_by` FOREIGN KEY (`paid_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `stock_request_items`
  ADD CONSTRAINT `fk_stock_request_items_item` FOREIGN KEY (`item_id`) REFERENCES `items` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_stock_request_items_request` FOREIGN KEY (`stock_request_id`) REFERENCES `stock_requests` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `suppliers`
  ADD CONSTRAINT `fk_suppliers_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `user_roles`
  ADD CONSTRAINT `fk_user_roles_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_user_roles_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Runtime schema added by backend migrations after inventory.sql baseline

CREATE TABLE IF NOT EXISTS permissions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  permission_key VARCHAR(120) NOT NULL UNIQUE,
  module VARCHAR(100) NOT NULL,
  feature VARCHAR(100) NOT NULL,
  description TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS role_permissions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role_id BIGINT UNSIGNED NOT NULL,
  permission_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_role_permission (role_id, permission_id),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO permissions (permission_key, module, feature, description) VALUES
  ('dashboard.view', 'Dashboard', 'Overview', 'View dashboard overview'),
  ('inventory.view', 'Inventory', 'Inventory', 'Open inventory module'),
  ('items.view', 'Inventory', 'Items', 'View items'),
  ('items.create', 'Inventory', 'Items', 'Create items'),
  ('items.update', 'Inventory', 'Items', 'Edit items'),
  ('items.archive', 'Inventory', 'Items', 'Archive and restore items'),
  ('items.delete', 'Inventory', 'Items', 'Permanently delete items'),
  ('items.stock_entry', 'Inventory', 'Items', 'Create stock entries'),
  ('items.adjust_stock', 'Inventory', 'Items', 'Adjust stock'),
  ('categories.view', 'Inventory', 'Categories', 'View categories'),
  ('categories.manage', 'Inventory', 'Categories', 'Create and edit categories'),
  ('categories.archive', 'Inventory', 'Categories', 'Archive and restore categories'),
  ('categories.delete', 'Inventory', 'Categories', 'Permanently delete categories'),
  ('suppliers.view', 'Inventory', 'Suppliers', 'View suppliers'),
  ('suppliers.manage', 'Inventory', 'Suppliers', 'Create and edit suppliers'),
  ('suppliers.archive', 'Inventory', 'Suppliers', 'Archive and restore suppliers'),
  ('suppliers.delete', 'Inventory', 'Suppliers', 'Permanently delete suppliers'),
  ('purchase_orders.view', 'Inventory', 'Purchase Orders', 'View purchase orders'),
  ('purchase_orders.create', 'Inventory', 'Purchase Orders', 'Create purchase orders'),
  ('purchase_orders.update', 'Inventory', 'Purchase Orders', 'Edit purchase orders'),
  ('purchase_orders.receive', 'Inventory', 'Purchase Orders', 'Receive purchase orders'),
  ('purchase_orders.cancel', 'Inventory', 'Purchase Orders', 'Cancel purchase orders'),
  ('stock_movements.view', 'Inventory', 'Stock Movements', 'View stock movement ledger'),
  ('fleet.view', 'Fleet', 'Fleet', 'Open fleet and dispatch module'),
  ('drivers.view', 'Fleet', 'Drivers', 'View drivers'),
  ('drivers.create', 'Fleet', 'Drivers', 'Create drivers'),
  ('drivers.update', 'Fleet', 'Drivers', 'Edit drivers'),
  ('drivers.archive', 'Fleet', 'Drivers', 'Archive and restore drivers'),
  ('drivers.delete', 'Fleet', 'Drivers', 'Permanently delete drivers'),
  ('drivers.view_balance', 'Fleet', 'Drivers', 'View driver balances'),
  ('locations.view', 'Fleet', 'Locations', 'View driver locations'),
  ('locations.manage', 'Fleet', 'Locations', 'Create, edit, archive, and restore driver locations'),
  ('commissions.manage', 'Fleet', 'Commissions', 'Manage location commission rules'),
  ('targets.manage', 'Fleet', 'Targets', 'Manage monthly location and driver targets'),
  ('stock_requests.view', 'Fleet', 'Stock Requests', 'View stock requests'),
  ('stock_requests.create', 'Fleet', 'Stock Requests', 'Create stock requests'),
  ('stock_requests.update', 'Fleet', 'Stock Requests', 'Edit stock requests'),
  ('stock_requests.accept', 'Fleet', 'Stock Requests', 'Accept stock requests'),
  ('stock_requests.complete', 'Fleet', 'Stock Requests', 'Complete stock requests'),
  ('stock_requests.cancel', 'Fleet', 'Stock Requests', 'Cancel stock requests'),
  ('stock_requests.print', 'Fleet', 'Stock Requests', 'Print accepted stock requests'),
  ('payments.view', 'Fleet', 'Payments', 'View payments'),
  ('payments.create', 'Fleet', 'Payments', 'Record payments'),
  ('reports.view', 'Reports', 'Reports', 'View reports'),
  ('notifications.view', 'Notifications', 'Notifications', 'View in-app notifications'),
  ('attachments.manage', 'Attachments', 'Files', 'Upload and manage record attachments'),
  ('team.view', 'Team', 'Users', 'View users and roles'),
  ('users.manage', 'Team', 'Users', 'Create and edit user accounts'),
  ('users.reset_password', 'Team', 'Users', 'Reset user passwords'),
  ('roles.manage', 'Team', 'Roles', 'Create roles and assign permissions'),
  ('audit_logs.view', 'Audit', 'Audit Logs', 'View audit logs'),
  ('settings.manage', 'Configuration', 'Settings', 'Manage system configuration'),
  ('driver_portal.view', 'Driver Portal', 'Requests', 'View own driver portal requests');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key IN ('dashboard.view', 'inventory.view', 'items.view', 'items.create', 'items.update', 'items.archive', 'items.delete', 'items.stock_entry', 'items.adjust_stock', 'categories.view', 'categories.manage', 'categories.archive', 'categories.delete', 'suppliers.view', 'suppliers.manage', 'suppliers.archive', 'suppliers.delete', 'purchase_orders.view', 'purchase_orders.create', 'purchase_orders.update', 'purchase_orders.receive', 'purchase_orders.cancel', 'stock_movements.view', 'fleet.view', 'drivers.view', 'drivers.create', 'drivers.update', 'drivers.archive', 'drivers.delete', 'drivers.view_balance', 'locations.view', 'locations.manage', 'commissions.manage', 'targets.manage', 'stock_requests.view', 'stock_requests.create', 'stock_requests.update', 'stock_requests.accept', 'stock_requests.complete', 'stock_requests.cancel', 'stock_requests.print', 'payments.view', 'payments.create', 'reports.view', 'notifications.view', 'attachments.manage', 'team.view', 'users.manage', 'users.reset_password', 'roles.manage', 'audit_logs.view', 'settings.manage', 'driver_portal.view') WHERE r.code = 'admin';
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key IN ('inventory.view', 'items.view', 'items.create', 'items.update', 'items.archive', 'items.stock_entry', 'items.adjust_stock', 'categories.view', 'categories.manage', 'categories.archive', 'suppliers.view', 'suppliers.manage', 'suppliers.archive', 'purchase_orders.view', 'purchase_orders.create', 'purchase_orders.update', 'purchase_orders.receive', 'purchase_orders.cancel', 'stock_movements.view', 'notifications.view', 'attachments.manage') WHERE r.code = 'inventory';
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key IN ('fleet.view', 'drivers.view', 'drivers.create', 'drivers.update', 'drivers.archive', 'drivers.view_balance', 'locations.view', 'locations.manage', 'commissions.manage', 'targets.manage', 'stock_requests.view', 'stock_requests.create', 'stock_requests.update', 'stock_requests.accept', 'stock_requests.complete', 'stock_requests.cancel', 'stock_requests.print', 'payments.view', 'payments.create', 'notifications.view', 'attachments.manage') WHERE r.code = 'accountant';
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key IN ('driver_portal.view', 'notifications.view') WHERE r.code = 'driver';

CREATE TABLE IF NOT EXISTS settings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  setting_key VARCHAR(120) NOT NULL UNIQUE,
  setting_value LONGTEXT NULL,
  value_type VARCHAR(50) DEFAULT 'string',
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  CONSTRAINT fk_settings_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS stock_request_prints (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  stock_request_id BIGINT UNSIGNED NOT NULL,
  printed_by BIGINT UNSIGNED NULL,
  printer_name VARCHAR(255) NULL,
  qz_version VARCHAR(100) NULL,
  status ENUM('success', 'failed') NOT NULL,
  error_message TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_stock_request_prints_request FOREIGN KEY (stock_request_id) REFERENCES stock_requests(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_stock_request_prints_user FOREIGN KEY (printed_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE stock_requests
  ADD COLUMN IF NOT EXISTS driver_invoice_viewed_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS driver_received_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS driver_received_by BIGINT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS driver_receipt_notes TEXT NULL;

CREATE TABLE IF NOT EXISTS stock_request_item_confirmations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  stock_request_id BIGINT UNSIGNED NOT NULL,
  stock_request_item_id BIGINT UNSIGNED NOT NULL,
  confirmed TINYINT(1) NOT NULL DEFAULT 0,
  confirmed_quantity DECIMAL(12,2) NOT NULL DEFAULT 0,
  confirmed_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  UNIQUE KEY uq_stock_request_item_confirmation (stock_request_item_id),
  CONSTRAINT fk_sric_request FOREIGN KEY (stock_request_id) REFERENCES stock_requests(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_sric_item FOREIGN KEY (stock_request_item_id) REFERENCES stock_request_items(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS locations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL UNIQUE,
  description TEXT NULL,
  status ENUM('active', 'inactive') DEFAULT 'active',
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  CONSTRAINT fk_locations_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS current_location_id BIGINT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS monthly_salary DECIMAL(12,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS driver_location_assignments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  driver_id BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  assigned_from DATETIME NOT NULL,
  assigned_until DATETIME NULL,
  assigned_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  INDEX idx_driver_location_current (driver_id, assigned_until),
  CONSTRAINT fk_dla_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_dla_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_dla_assigned_by FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS commission_location_id BIGINT UNSIGNED NULL;

CREATE TABLE IF NOT EXISTS location_commission_rules (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  location_id BIGINT UNSIGNED NOT NULL,
  base_commission_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  target_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  target_bonus_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  effective_from DATE NULL,
  effective_until DATE NULL,
  status ENUM('active', 'inactive') DEFAULT 'active',
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  INDEX idx_location_commission_rule_lookup (location_id, status, effective_from, effective_until),
  CONSTRAINT fk_lcr_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_lcr_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS location_monthly_targets (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  location_id BIGINT UNSIGNED NOT NULL,
  target_month CHAR(7) NOT NULL,
  target_mode ENUM('location_total', 'per_driver') NOT NULL DEFAULT 'location_total',
  target_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  status ENUM('active', 'inactive') DEFAULT 'active',
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  UNIQUE KEY uq_location_monthly_target (location_id, target_month),
  INDEX idx_location_monthly_targets_lookup (target_month, status),
  CONSTRAINT fk_lmt_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_lmt_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE stock_entries ADD COLUMN IF NOT EXISTS base_quantity DECIMAL(12,2) NULL;
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS ordered_base_quantity DECIMAL(12,2) NULL, ADD COLUMN IF NOT EXISTS received_base_quantity DECIMAL(12,2) NULL;
ALTER TABLE stock_request_items ADD COLUMN IF NOT EXISTS base_quantity DECIMAL(12,2) NULL;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS entered_quantity DECIMAL(12,2) NULL, ADD COLUMN IF NOT EXISTS entered_unit_label VARCHAR(100) NULL, ADD COLUMN IF NOT EXISTS base_quantity DECIMAL(12,2) NULL;

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS size_value DECIMAL(12,3) NULL,
  ADD COLUMN IF NOT EXISTS size_unit VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS is_carton TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS carton_item_id BIGINT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS carton_quantity DECIMAL(12,3) NULL,
  ADD COLUMN IF NOT EXISTS barcode VARCHAR(150) NULL,
  ADD COLUMN IF NOT EXISTS track_batches TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE stock_entries ADD COLUMN IF NOT EXISTS batch_number VARCHAR(100) NULL, ADD COLUMN IF NOT EXISTS expiry_date DATE NULL;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS batch_id BIGINT UNSIGNED NULL;

CREATE TABLE IF NOT EXISTS stock_reservations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  stock_request_id BIGINT UNSIGNED NOT NULL,
  stock_request_item_id BIGINT UNSIGNED NOT NULL,
  item_id BIGINT UNSIGNED NOT NULL,
  quantity DECIMAL(12,2) NOT NULL,
  status ENUM('active', 'released', 'consumed') NOT NULL DEFAULT 'active',
  created_by BIGINT UNSIGNED NULL,
  released_at DATETIME NULL,
  consumed_at DATETIME NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS inventory_batches (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  item_id BIGINT UNSIGNED NOT NULL,
  supplier_id BIGINT UNSIGNED NULL,
  purchase_order_item_id BIGINT UNSIGNED NULL,
  batch_number VARCHAR(100) NULL,
  expiry_date DATE NULL,
  quantity_received DECIMAL(12,2) NOT NULL,
  quantity_remaining DECIMAL(12,2) NOT NULL,
  unit_cost DECIMAL(12,2) DEFAULT 0,
  status ENUM('valid', 'expiring_soon', 'expired', 'depleted') NOT NULL DEFAULT 'valid',
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS stock_movement_batches (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  stock_movement_id BIGINT UNSIGNED NOT NULL,
  batch_id BIGINT UNSIGNED NOT NULL,
  quantity DECIMAL(12,2) NOT NULL,
  created_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  type VARCHAR(80) NOT NULL,
  title VARCHAR(180) NOT NULL,
  message TEXT NULL,
  entity_type VARCHAR(100) NULL,
  entity_id BIGINT UNSIGNED NULL,
  read_at DATETIME NULL,
  created_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS attachments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  entity_type VARCHAR(100) NOT NULL,
  entity_id BIGINT UNSIGNED NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(150) NOT NULL,
  size BIGINT UNSIGNED NOT NULL,
  storage_path VARCHAR(500) NOT NULL,
  uploaded_by BIGINT UNSIGNED NULL,
  created_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS login_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  email VARCHAR(150) NULL,
  event_type ENUM('success', 'failed', 'password_changed', 'admin_reset_password') NOT NULL,
  ip_address VARCHAR(100) NULL,
  user_agent TEXT NULL,
  created_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO settings (setting_key, setting_value, value_type, created_at, updated_at) VALUES
  ('accepted_request_fulfillment_mode', 'both', 'string', NOW(), NOW()),
  ('qz_tray_enabled', 'true', 'boolean', NOW(), NOW()),
  ('qz_default_printer', '', 'string', NOW(), NOW()),
  ('commissions_enabled', 'false', 'boolean', NOW(), NOW()),
  ('commission_period', 'monthly', 'string', NOW(), NOW()),
  ('commission_source_status', 'completed', 'string', NOW(), NOW());

CREATE INDEX idx_stock_requests_completed_at ON stock_requests (completed_at);
CREATE INDEX idx_stock_requests_driver_status ON stock_requests (driver_id, request_status);
CREATE INDEX idx_stock_requests_commission_location ON stock_requests (commission_location_id);
CREATE INDEX idx_stock_requests_status_payment ON stock_requests (request_status, payment_status);
CREATE INDEX idx_stock_requests_request_date ON stock_requests (request_date);
CREATE INDEX idx_payments_driver_date ON payments (driver_id, payment_date);
CREATE INDEX idx_payments_date ON payments (payment_date);
CREATE INDEX idx_stock_reservations_item_status ON stock_reservations (item_id, status);
CREATE INDEX idx_driver_loc_assign_location_from ON driver_location_assignments (location_id, assigned_from);
CREATE INDEX idx_inventory_batches_item_status_qty ON inventory_batches (item_id, status, quantity_remaining);
CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at);
CREATE INDEX idx_notifications_user_read ON notifications (user_id, read_at);
CREATE INDEX idx_confirmations_item_id ON stock_request_item_confirmations (stock_request_item_id);


-- Mark this destructive reset migration as applied if you ran this SQL manually.
CREATE TABLE IF NOT EXISTS `sequelize_meta` (`name` VARCHAR(255) NOT NULL PRIMARY KEY);
INSERT IGNORE INTO `sequelize_meta` (`name`) VALUES ('20260521000000-reset-schema-from-inventory-sql.js');
