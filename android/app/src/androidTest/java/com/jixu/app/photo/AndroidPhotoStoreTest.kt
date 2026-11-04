package com.jixu.app.photo

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/** §12：落盘前长边 ≤1600、JPEG 80；删除只动 photos 目录；清除数据清空全部照片。 */
@RunWith(AndroidJUnit4::class)
class AndroidPhotoStoreTest {

    @Test
    fun compressesTo1600AndDeletesSafely() {
        runBlocking {
            val ctx = InstrumentationRegistry.getInstrumentation().targetContext
            val store = AndroidPhotoStore(ctx)

            val source = File(ctx.cacheDir, "photo-source.jpg")
            val bitmap = Bitmap.createBitmap(3000, 2000, Bitmap.Config.ARGB_8888)
            source.outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG, 95, it) }
            bitmap.recycle()

            val saved = store.saveFromUri(Uri.fromFile(source))
            assertNotNull("照片保存失败", saved)
            val savedFile = File(saved!!)
            assertTrue(savedFile.isFile)

            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(saved, bounds)
            assertEquals(1600, maxOf(bounds.outWidth, bounds.outHeight))

            store.delete(saved)
            assertFalse(savedFile.exists())

            // 目录外路径绝不能删
            val outside = File(ctx.cacheDir, "outside-keep.txt").apply { writeText("keep") }
            store.delete(outside.absolutePath)
            assertTrue(outside.exists())

            // 再存一张，清空后 photos 目录为空
            val again = store.saveFromUri(Uri.fromFile(source))
            assertNotNull(again)
            store.clearAll()
            assertFalse(File(again!!).exists())

            source.delete()
            outside.delete()
        }
    }
}
