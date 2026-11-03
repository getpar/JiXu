package com.jixu.app.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.jixu.app.sync.KVStore
import kotlinx.coroutines.flow.first

/**
 * DataStore 键值存储（开发文档 §4.2）。所有键名与小程序同名；安卓新增 auth_* 系列。
 * 引擎的 lastSyncKey 也走这里。
 */
private val Context.dataStore by preferencesDataStore(name = "jixu_prefs")

class PrefsStore(private val context: Context) : KVStore {

    override suspend fun get(key: String): String? =
        context.dataStore.data.first()[stringPreferencesKey(key)]

    override suspend fun set(key: String, value: String) {
        context.dataStore.edit { it[stringPreferencesKey(key)] = value }
    }

    override suspend fun remove(key: String) {
        context.dataStore.edit { it.remove(stringPreferencesKey(key)) }
    }

    override suspend fun clear() {
        context.dataStore.edit { it.clear() }
    }
}

/** DataStore 键名常量（防手滑拼错） */
object PrefsKeys {
    const val CLOUD_OWNER_ID = "cloud_owner_id"
    const val DEVICE_TAG = "device_tag"
    const val CLOUD_ENV_ID = "cloud_env_id"
    const val AUTH_DEVICE_ID = "auth_device_id"
    const val AUTH_ACCESS_TOKEN = "auth_access_token"
    const val AUTH_REFRESH_TOKEN = "auth_refresh_token"
    const val AUTH_EXPIRES_AT = "auth_expires_at"
    const val BUDGET = "budget"
    const val UI_THEME_PREF = "ui_theme_pref"
    const val LAST_DUE_REMIND = "last_due_remind"
}
