CREATE TYPE "CampaignAttachmentCategory" AS ENUM (
    'DOCUMENTS',
    'IMAGES',
    'VIDEOS',
    'PRESENTATIONS',
    'SPREADSHEETS',
    'PROGRAMMING',
    'DATA',
    'COMPRESSED'
);

ALTER TABLE "EmailDelivery"
ADD COLUMN "recipientData" JSONB;

CREATE TABLE "CampaignAttachment" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "category" "CampaignAttachmentCategory" NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CampaignAttachment_campaignId_idx"
ON "CampaignAttachment"("campaignId");

ALTER TABLE "CampaignAttachment"
ADD CONSTRAINT "CampaignAttachment_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
