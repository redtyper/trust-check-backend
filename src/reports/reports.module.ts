import { Module, Logger } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';

// Multer configuration constants
const UPLOADS_DIR = process.env.UPLOADS_DIR || 'uploads/screenshots';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const FILE_FIELD_NAME = 'file';

/**
 * ReportsModule - Manages report creation, storage, and retrieval
 * Includes file upload configuration with Multer
 */
@Module({
  imports: [
    MulterModule.register({
      storage: diskStorage({
        destination: (req, file, cb) => {
          // Create destination path with timestamp for better organization
          const dest = path.join(
            process.cwd(),
            UPLOADS_DIR,
            new Date().toISOString().split('T')[0], // Group by date
          );
          cb(null, dest);
        },
        filename: (req, file, cb) => {
          // Generate unique filename with timestamp
          const timestamp = Date.now();
          const random = Math.random().toString(36).substring(2, 8);
          const ext = path.extname(file.originalname);
          const name = path.basename(
            file.originalname,
            ext,
          ).replace(/[^a-z0-9]/gi, '-');
          cb(null, `${name}-${timestamp}-${random}${ext}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        // Validate file type
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          cb(
            new Error(
              `Invalid file type. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
            ),
            false,
          );
        } else {
          cb(null, true);
        }
      },
      limits: {
        fileSize: MAX_FILE_SIZE,
      },
    }),
  ],
  controllers: [ReportsController],
  providers: [ReportsService, Logger],
  exports: [ReportsService],
})
export class ReportsModule {}
