import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
}

// 发布签名（开发文档 §14）：keystore.properties 与 *.jks 都不进 git。
// 负责人自己生成 jixu-release.jks 后，在 android/keystore.properties 里写：
//   storeFile=jixu-release.jks
//   storePassword=…
//   keyAlias=jixu
//   keyPassword=…
// 没有该文件时 release 仍可构建（unsigned），用于验证 R8，不可分发。
val keystorePropsFile = rootProject.file("keystore.properties")
val hasReleaseSigning = keystorePropsFile.isFile
val keystoreProps = Properties().apply {
    if (hasReleaseSigning) keystorePropsFile.inputStream().use { load(it) }
}
if (hasReleaseSigning) {
    listOf("storeFile", "storePassword", "keyAlias", "keyPassword").forEach { key ->
        check(!keystoreProps.getProperty(key).isNullOrBlank()) {
            "android/keystore.properties 缺少 $key（格式见 keystore.properties.example）"
        }
    }
}

android {
    namespace = "com.jixu.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.jixu.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            signingConfig = if (hasReleaseSigning) signingConfigs.getByName("release") else null
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources.excludes += setOf(
            "/META-INF/{AL2.0,LGPL2.1}",
            "/META-INF/DEPENDENCIES",
            "/META-INF/LICENSE*",
            "/META-INF/NOTICE*",
            "/META-INF/INDEX.LIST",
        )
    }

    // 金标准测试直接读 android/fixtures，不复制副本（开发文档 §3.3）
    sourceSets["test"].resources.directories.add("$rootDir/fixtures")
}

// 执行计划 P9：产物直接叫「计序-v1.0.0.apk」。
// 未配置签名时不改名，避免把 unsigned 包误当成品发出去。
androidComponents {
    onVariants { variant ->
        if (variant.buildType == "release" && hasReleaseSigning) {
            variant.outputs.forEach { output ->
                output.outputFileName.set("计序-v${output.versionName.get()}.apk")
            }
        }
    }
}

ksp {
    arg("room.schemaLocation", "$projectDir/schemas")
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.navigation.compose)

    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)

    implementation(libs.androidx.datastore.preferences)

    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.okhttp)
    implementation(libs.fastexcel)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)

    androidTestImplementation(libs.androidx.test.junit)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.test.espresso.core)
    androidTestImplementation(libs.androidx.room.testing)
    androidTestImplementation(libs.kotlinx.coroutines.test)

    debugImplementation(libs.androidx.compose.ui.tooling)
}
