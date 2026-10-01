import { Request, Response } from 'express';

import { fileService } from '../services/file.service';
import { HTTPError } from '../utils/http-error';
import { withAsync } from '../utils/async-handler';

const rawFileController = {
  async createSignedUrl(req: Request, res: Response): Promise<void> {
    const body = req.body as { bucket: 'attendance-evidence' | 'media' | 'avatars'; path: string; expiresIn?: number };
    const user = req.user;
    if (!user) throw HTTPError.unauthorized();
    const url = await fileService.createSignedUrl(body.bucket, body.path, body.expiresIn, {
      id: user.id,
      role: user.role,
    });
    res.status(200).json({ success: true, data: url });
  },
};

export const fileController = withAsync(rawFileController);