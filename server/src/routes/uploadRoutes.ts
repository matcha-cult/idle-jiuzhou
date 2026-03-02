import { Router, NextFunction, Request, Response } from "express";
/**
 * 头像上传路由
 *
 * 作用：
 * - COS 模式：presign → 客户端直传 → confirm 三步流程
 * - 本地模式：POST /avatar multipart 单步上传（开发回退）
 * - DELETE /avatar 通用删除
 *
 * 数据流（COS 直传）：
 * - POST /avatar/presign → { cosEnabled, presignUrl, avatarUrl }
 * - 客户端 PUT 文件到 presignUrl
 * - POST /avatar/confirm → 更新 DB
 *
 * 数据流（本地回退）：
 * - POST /avatar/presign → { cosEnabled: false }
 * - POST /avatar（multipart） → 写本地 + 更新 DB
 *
 * 关键边界条件：
 * 1) presign 端点同时返回 cosEnabled 标记，客户端据此决定走直传还是 FormData
 * 2) confirm 端点校验 avatarUrl 域名，防止客户端伪造任意 URL
 */
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import {
  ALLOWED_MIME_TYPES,
  avatarUpload,
  COS_ENABLED,
  generatePresignUrl,
  confirmAvatar,
  updateAvatarLocal,
  deleteAvatar,
} from "../services/uploadService.js";
import { safePushCharacterUpdate } from "../middleware/pushUpdate.js";
import { sendSuccess, sendResult } from "../middleware/response.js";
import { BusinessError } from "../middleware/BusinessError.js";

const router = Router();

// ─── COS 直传：获取预签名 URL ───

router.post(
  "/avatar/presign",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    if (!COS_ENABLED) {
      sendSuccess(res, { cosEnabled: false });
      return;
    }

    const { contentType } = req.body as { contentType?: string };
    if (!contentType || !ALLOWED_MIME_TYPES.includes(contentType)) {
      throw new BusinessError("只支持 JPG、PNG、GIF、WEBP 格式的图片");
    }

    const { presignUrl, avatarUrl } = await generatePresignUrl(contentType);
    sendSuccess(res, { cosEnabled: true, presignUrl, avatarUrl });
  }),
);

// ─── COS 直传：确认上传完成 ───

router.post(
  "/avatar/confirm",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { avatarUrl } = req.body as { avatarUrl?: string };

    if (!avatarUrl) {
      throw new BusinessError("缺少 avatarUrl");
    }

    const result = await confirmAvatar(userId, avatarUrl);

    if (result.success) {
      await safePushCharacterUpdate(userId);
    }

    sendResult(res, result);
  }),
);

// ─── 本地回退：multipart 上传 ───

const avatarUploadMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  avatarUpload.single("avatar")(req, res, (error?: Error | string | null) => {
    if (!error) {
      next();
      return;
    }

    if (typeof error === "string") {
      res.status(400).json({ success: false, message: error });
      return;
    }

    const uploadError = error as Error & { name?: string; code?: string };
    if (
      uploadError.name === "MulterError" &&
      uploadError.code === "LIMIT_FILE_SIZE"
    ) {
      res.status(400).json({ success: false, message: "图片大小不能超过2MB" });
      return;
    }

    if (uploadError.message.includes("只支持")) {
      res.status(400).json({ success: false, message: uploadError.message });
      return;
    }

    console.error("上传头像错误:", uploadError);
    res.status(500).json({ success: false, message: "上传失败" });
  });
};

router.post(
  "/avatar",
  requireAuth,
  avatarUploadMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.userId!;
    const file = req.file;

    if (!file) {
      throw new BusinessError("请选择图片文件");
    }

    const result = await updateAvatarLocal(userId, file);

    if (result.success) {
      await safePushCharacterUpdate(userId);
    }

    sendResult(res, result);
  }),
);

// ─── 删除头像（通用） ───

router.delete("/avatar", requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const result = await deleteAvatar(userId);

  if (result.success) {
    await safePushCharacterUpdate(userId);
  }

  sendResult(res, result);
}));

export default router;
