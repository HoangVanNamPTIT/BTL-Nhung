-- CreateTable FirmwareUpdateLog
CREATE TABLE `firmware_update_logs` (
    `id` VARCHAR(191) NOT NULL,
    `firmware_id` VARCHAR(191) NOT NULL,
    `device_id` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `error_message` VARCHAR(191) NULL,
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `firmware_update_logs_firmware_id_device_id_key`(`firmware_id`, `device_id`),
    INDEX `firmware_update_logs_firmware_id_idx`(`firmware_id`),
    INDEX `firmware_update_logs_device_id_idx`(`device_id`),
    INDEX `firmware_update_logs_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable OTAUpdateSession
CREATE TABLE `ota_update_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `firmware_id` VARCHAR(191) NOT NULL,
    `initiated_by` VARCHAR(191) NULL,
    `device_ids` JSON NOT NULL,
    `total_devices` INTEGER NOT NULL,
    `completed_count` INTEGER NOT NULL DEFAULT 0,
    `success_count` INTEGER NOT NULL DEFAULT 0,
    `failed_count` INTEGER NOT NULL DEFAULT 0,
    `session_status` VARCHAR(191) NOT NULL DEFAULT 'in_progress',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `ota_update_sessions_firmware_id_idx`(`firmware_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `firmware_update_logs` ADD CONSTRAINT `firmware_update_logs_firmware_id_fkey` FOREIGN KEY (`firmware_id`) REFERENCES `firmwares`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `firmware_update_logs` ADD CONSTRAINT `firmware_update_logs_device_id_fkey` FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddColumn to firmwares table
ALTER TABLE `firmwares` ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
