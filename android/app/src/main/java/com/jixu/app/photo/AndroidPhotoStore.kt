package com.jixu.app.photo

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import androidx.core.content.FileProvider
import com.jixu.app.data.PhotoStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/**
 * 小票照片（开发文档 §12）：相册/相机 → 长边 ≤1600、JPEG 80 → `filesDir/photos/<毫秒>.jpg`。
 * 只存本机、不上云；不声明相机/存储权限（系统相机与照片选择器都不需要）。
 */
class AndroidPhotoStore(private val context: Context) : PhotoStore {

    private val photosDir: File get() = File(context.filesDir, "photos").apply { mkdirs() }

    private val cameraDir: File get() = File(context.cacheDir, "camera").apply { mkdirs() }

    /** 系统相机的输出文件（拍完再压缩导入，失败/取消即删） */
    fun newCameraFile(): File =
        File(cameraDir, "cam_${System.currentTimeMillis()}.jpg")

    /** 系统相机要求 content:// URI */
    fun uriFor(file: File): Uri =
        FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)

    /**
     * 相册 Uri 或相机临时文件 → 压缩后落到 photos 目录。
     * 失败（不是图片、IO 错误、无法编码）返回 null，由界面提示「照片保存失败」。
     */
    suspend fun saveFromUri(uri: Uri): String? = withContext(Dispatchers.IO) {
        val tmp = File(cameraDir, "in_${System.currentTimeMillis()}.jpg")
        try {
            val opened = context.contentResolver.openInputStream(uri)?.use { input ->
                tmp.outputStream().use { output -> input.copyTo(output) }
                true
            } ?: false
            if (!opened) return@withContext null
            importFile(tmp)
        } catch (_: Exception) {
            null
        } finally {
            tmp.delete()
        }
    }

    /** 读取用于界面展示的缩略图/大图（按需采样，不把整张原图读进内存） */
    fun decodeSampled(path: String, maxSide: Int): Bitmap? = runCatching {
        val file = File(path)
        if (!file.isFile) return@runCatching null
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(path, bounds)
        val opts = BitmapFactory.Options().apply {
            inSampleSize = sampleSize(bounds.outWidth, bounds.outHeight, maxSide)
        }
        BitmapFactory.decodeFile(path, opts)
    }.getOrNull()

    override suspend fun delete(path: String) = withContext(Dispatchers.IO) {
        val file = File(path)
        // 只删 photos 目录里的文件，防止误删外部路径
        if (file.canonicalPath.startsWith(photosDir.canonicalPath + File.separator)) file.delete()
        Unit
    }

    override suspend fun clearAll() = withContext(Dispatchers.IO) {
        photosDir.deleteRecursively()
        photosDir.mkdirs()
        cameraDir.deleteRecursively()
        cameraDir.mkdirs()
        Unit
    }

    // ==================== 内部 ====================

    private fun importFile(source: File): String? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(source.absolutePath, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

        val opts = BitmapFactory.Options().apply {
            inSampleSize = sampleSize(bounds.outWidth, bounds.outHeight, MAX_SIDE)
        }
        var bitmap = BitmapFactory.decodeFile(source.absolutePath, opts) ?: return null
        bitmap = rotateByExif(bitmap, source)
        if (maxOf(bitmap.width, bitmap.height) > MAX_SIDE) {
            val scale = MAX_SIDE.toFloat() / maxOf(bitmap.width, bitmap.height)
            val scaled = Bitmap.createScaledBitmap(
                bitmap,
                (bitmap.width * scale).toInt().coerceAtLeast(1),
                (bitmap.height * scale).toInt().coerceAtLeast(1),
                true,
            )
            if (scaled !== bitmap) bitmap.recycle()
            bitmap = scaled
        }

        val dest = File(photosDir, "${System.currentTimeMillis()}.jpg")
        val ok = runCatching {
            dest.outputStream().use { out -> bitmap.compress(Bitmap.CompressFormat.JPEG, QUALITY, out) }
        }.getOrDefault(false)
        bitmap.recycle()
        if (!ok || dest.length() == 0L) {
            dest.delete()
            return null
        }
        return dest.absolutePath
    }

    private fun rotateByExif(bitmap: Bitmap, source: File): Bitmap {
        val orientation = runCatching {
            ExifInterface(source.absolutePath)
                .getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
        }.getOrDefault(ExifInterface.ORIENTATION_NORMAL)
        val matrix = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
            ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
            ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.postScale(-1f, 1f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.postScale(1f, -1f)
            else -> return bitmap
        }
        return runCatching {
            Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
                .also { if (it !== bitmap) bitmap.recycle() }
        }.getOrDefault(bitmap)
    }

    private fun sampleSize(width: Int, height: Int, maxSide: Int): Int {
        var sample = 1
        var longSide = maxOf(width, height)
        while (longSide / 2 >= maxSide) {
            sample *= 2
            longSide /= 2
        }
        return sample
    }

    private companion object {
        const val MAX_SIDE = 1600
        const val QUALITY = 80
    }
}
