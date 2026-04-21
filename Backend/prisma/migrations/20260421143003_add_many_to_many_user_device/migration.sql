/*
  Warnings:

  - You are about to drop the column `owner_id` on the `devices` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `devices` DROP FOREIGN KEY `devices_owner_id_fkey`;

-- DropIndex
DROP INDEX `devices_owner_id_fkey` ON `devices`;

-- AlterTable
ALTER TABLE `devices` DROP COLUMN `owner_id`;

-- CreateTable
CREATE TABLE `user_devices` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `device_id` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'owner',
    `added_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `user_devices_device_id_idx`(`device_id`),
    UNIQUE INDEX `user_devices_user_id_device_id_key`(`user_id`, `device_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_devices` ADD CONSTRAINT `user_devices_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_devices` ADD CONSTRAINT `user_devices_device_id_fkey` FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
