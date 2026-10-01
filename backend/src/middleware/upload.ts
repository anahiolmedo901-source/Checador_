import multer from 'multer';

const MAX_MEDIA_BYTES = 50 * 1024 * 1024;

const ACCEPTED_MIME = /^(image\/(jpeg|png|webp)|video\/(mp4|webm))$/;

/** Sube multimedia a memoria (bucket `media`, máx. 50 MB). */
export const uploadMedia = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MEDIA_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ACCEPTED_MIME.test(file.mimetype)) {
      cb(new multer.MulterError('FILE_TYPE_NOT_ALLOWED' as never, 'Tipo de archivo no permitido (JPEG, PNG, WEBP, MP4, WebM).'));
      return;
    }
    cb(null, true);
  },
}).single('file');