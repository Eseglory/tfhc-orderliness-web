ALTER TABLE "chat_messages" ADD COLUMN "clientOperationId" TEXT;
CREATE UNIQUE INDEX "chat_messages_clientOperationId_key" ON "chat_messages"("clientOperationId");
CREATE TABLE "pwa_device_sessions" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "tokenHash" TEXT NOT NULL UNIQUE, "issuedAt" TIMESTAMP(3) NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "pwa_device_sessions_userId_idx" ON "pwa_device_sessions"("userId");
CREATE INDEX "pwa_device_sessions_expiresAt_idx" ON "pwa_device_sessions"("expiresAt");
CREATE TABLE "resumable_uploads" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "replyToId" TEXT, "roomId" TEXT NOT NULL, "name" TEXT NOT NULL, "mime" TEXT NOT NULL, "size" INTEGER NOT NULL,
 "sha256" TEXT NOT NULL, "offset" INTEGER NOT NULL DEFAULT 0, "data" BYTEA NOT NULL,
 "messageId" TEXT, "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "resumable_uploads_userId_roomId_sha256_idx" ON "resumable_uploads"("userId", "roomId", "sha256");
CREATE INDEX "resumable_uploads_expiresAt_idx" ON "resumable_uploads"("expiresAt");
