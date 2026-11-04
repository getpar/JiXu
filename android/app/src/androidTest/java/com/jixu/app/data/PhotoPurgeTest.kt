package com.jixu.app.data

import android.graphics.Bitmap
import android.net.Uri
import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.jixu.app.data.db.AppDatabase
import com.jixu.app.photo.AndroidPhotoStore
import com.jixu.app.sync.KVStore
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/** §7.4/§12：彻底删除一笔带小票的账后，照片文件必须被物理清理。 */
@RunWith(AndroidJUnit4::class)
class PhotoPurgeTest {

    @Test
    fun purgeDeletesOrphanPhoto() {
        runBlocking {
            val ctx = InstrumentationRegistry.getInstrumentation().targetContext
            val db = Room.inMemoryDatabaseBuilder(ctx, AppDatabase::class.java).build()
            val photos = AndroidPhotoStore(ctx)
            val repo = Repository(db, MemoryStore(), photos)

            val source = File(ctx.cacheDir, "purge-source.jpg")
            val bitmap = Bitmap.createBitmap(640, 480, Bitmap.Config.ARGB_8888)
            source.outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG, 90, it) }
            bitmap.recycle()

            val path = photos.saveFromUri(Uri.fromFile(source))
            assertNotNull(path)
            assertTrue(File(path!!).isFile)

            val id = repo.addRecord(
                NewRecord(
                    type = "expense",
                    amount = 1.0,
                    categoryKey = "food",
                    categoryName = "餐饮饮食",
                    subcategoryKey = "lunch",
                    subcategoryName = "午餐",
                    date = "2026-11-04",
                    photo = path,
                ),
            )
            repo.deleteRecord(id)
            repo.purgeRecord(id)

            assertFalse("彻底删除后照片文件仍在", File(path).exists())
            source.delete()
            db.close()
        }
    }

    private class MemoryStore : KVStore {
        private val map = mutableMapOf<String, String>()
        override suspend fun get(key: String): String? = map[key]
        override suspend fun set(key: String, value: String) {
            map[key] = value
        }
        override suspend fun remove(key: String) {
            map.remove(key)
        }
        override suspend fun clear() = map.clear()
    }
}
