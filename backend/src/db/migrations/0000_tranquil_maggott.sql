CREATE TYPE "public"."doc_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."doc_type" AS ENUM('aadhaar', 'license', 'rc', 'insurance', 'pan', 'selfie');--> statement-breakpoint
CREATE TYPE "public"."driver_status" AS ENUM('registered', 'docs_uploaded', 'under_review', 'active', 'rejected', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."vehicle_type" AS ENUM('bike', 'auto');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'accepted', 'picked_up', 'in_transit', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_mode" AS ENUM('prepaid', 'cod');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('created', 'paid', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."payment_type" AS ENUM('ride', 'order');--> statement-breakpoint
CREATE TYPE "public"."ride_status" AS ENUM('searching', 'accepted', 'arrived', 'started', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('sender', 'driver', 'admin');--> statement-breakpoint
CREATE TABLE "driver_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"doc_type" "doc_type" NOT NULL,
	"doc_number" varchar(50),
	"front_url" text NOT NULL,
	"back_url" text,
	"status" "doc_status" DEFAULT 'pending',
	"rejection_reason" text,
	"uploaded_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"phone" varchar(15) NOT NULL,
	"status" "driver_status" DEFAULT 'registered' NOT NULL,
	"vehicle_number" varchar(20),
	"vehicle_type" "vehicle_type" DEFAULT 'bike',
	"is_online" boolean DEFAULT false,
	"rating" numeric(3, 2) DEFAULT '5.00',
	"total_rides" numeric DEFAULT '0',
	"rejection_reason" text,
	"verified_by" uuid,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "drivers_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "drivers_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"driver_id" uuid,
	"sender_name" varchar(100) NOT NULL,
	"sender_phone" varchar(15) NOT NULL,
	"receiver_name" varchar(100) NOT NULL,
	"receiver_phone" varchar(15) NOT NULL,
	"pickup_address" text NOT NULL,
	"pickup_lat" numeric(10, 8) NOT NULL,
	"pickup_lng" numeric(11, 8) NOT NULL,
	"drop_address" text NOT NULL,
	"drop_lat" numeric(10, 8) NOT NULL,
	"drop_lng" numeric(11, 8) NOT NULL,
	"weight_kg" numeric(5, 2) DEFAULT '1',
	"description" varchar(200),
	"payment_mode" "payment_mode" DEFAULT 'prepaid',
	"cod_amount" numeric(10, 2) DEFAULT '0',
	"cod_collected" boolean DEFAULT false,
	"estimated_fare" numeric(10, 2),
	"final_fare" numeric(10, 2),
	"platform_cut" numeric(10, 2),
	"driver_earning" numeric(10, 2),
	"distance_km" numeric(6, 2),
	"pickup_otp" varchar(6),
	"delivery_otp" varchar(6),
	"status" "order_status" DEFAULT 'pending',
	"cancel_reason" text,
	"accepted_at" timestamp,
	"picked_up_at" timestamp,
	"delivered_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"reference_id" uuid NOT NULL,
	"type" "payment_type" NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"razorpay_order_id" varchar(100),
	"razorpay_payment_id" varchar(100),
	"status" "payment_status" DEFAULT 'created',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"driver_id" uuid,
	"pickup_address" text NOT NULL,
	"pickup_lat" numeric(10, 8) NOT NULL,
	"pickup_lng" numeric(11, 8) NOT NULL,
	"drop_address" text NOT NULL,
	"drop_lat" numeric(10, 8) NOT NULL,
	"drop_lng" numeric(11, 8) NOT NULL,
	"estimated_fare" numeric(10, 2),
	"final_fare" numeric(10, 2),
	"platform_cut" numeric(10, 2),
	"driver_earning" numeric(10, 2),
	"distance_km" numeric(6, 2),
	"duration_min" integer,
	"surge_multiplier" numeric(3, 2) DEFAULT '1.00',
	"start_otp" varchar(6),
	"status" "ride_status" DEFAULT 'searching',
	"cancel_reason" text,
	"accepted_at" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" varchar(15) NOT NULL,
	"name" varchar(100),
	"role" "role" DEFAULT 'sender' NOT NULL,
	"is_active" boolean DEFAULT true,
	"refresh_token" varchar(500),
	"created_at" timestamp DEFAULT now(),
	"last_login" timestamp DEFAULT now(),
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "driver_documents_driver_doc_type_idx" ON "driver_documents" USING btree ("driver_id","doc_type");