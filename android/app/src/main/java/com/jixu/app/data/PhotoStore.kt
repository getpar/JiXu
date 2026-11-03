package com.jixu.app.data

/**
 * 小票照片文件操作（开发文档 §12）。P3 只负责「什么时候该删」，
 * 真正的文件删除与目录清理在 P7 接入；测试可注入记录器。
 */
interface PhotoStore {
    /** 删除单个照片文件（文件已不在时静默） */
    suspend fun delete(path: String)

    /** 清除全部照片（清除所有数据时调用） */
    suspend fun clearAll()

    object Noop : PhotoStore {
        override suspend fun delete(path: String) = Unit
        override suspend fun clearAll() = Unit
    }
}
