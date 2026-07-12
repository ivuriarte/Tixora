-- AlterTable
ALTER TABLE "events" ADD COLUMN     "agenda" JSONB,
ADD COLUMN     "faqs" JSONB,
ADD COLUMN     "platform_fee" DECIMAL(10,2) NOT NULL DEFAULT 50,
ADD COLUMN     "speaker_name" TEXT,
ADD COLUMN     "sponsors" JSONB;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "confirmed_at" TIMESTAMP(3),
ADD COLUMN     "confirmed_by_admin_id" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "city" TEXT,
ADD COLUMN     "company" TEXT,
ADD COLUMN     "job_title" TEXT;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_confirmed_by_admin_id_fkey" FOREIGN KEY ("confirmed_by_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
