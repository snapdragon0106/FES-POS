CREATE TABLE `activity_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`operator` varchar(10) NOT NULL,
	`operatorName` varchar(50) NOT NULL DEFAULT '',
	`action` varchar(30) NOT NULL,
	`detail` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `activity_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `member_pins` (
	`id` int AUTO_INCREMENT NOT NULL,
	`memberId` varchar(10) NOT NULL,
	`pin` varchar(4) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `member_pins_id` PRIMARY KEY(`id`),
	CONSTRAINT `member_pins_memberId_unique` UNIQUE(`memberId`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`emoji` varchar(10) NOT NULL DEFAULT '📦',
	`price` int NOT NULL,
	`cost` int NOT NULL DEFAULT 0,
	`initialStock` int NOT NULL DEFAULT 0,
	`threshold` int NOT NULL DEFAULT 10,
	`displayOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `restocks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`amount` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `restocks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`operator` varchar(10) NOT NULL,
	`items` json NOT NULL,
	`total` int NOT NULL,
	`received` int NOT NULL,
	`changeAmount` int NOT NULL,
	`voided` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `transactions_id` PRIMARY KEY(`id`)
);
