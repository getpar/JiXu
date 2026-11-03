package com.jixu.app.core

/**
 * 分类表 —— 移植 `miniapp/src/utils/storage.ts` 的 DEFAULT_CATEGORIES /
 * mergedCategoriesSync / fillCatNames（开发文档 §7.3）。
 * key 必须一字不差，三端靠 key 对账；显示名以此为准。
 */

data class SubCategory(val key: String, val name: String)

data class CategoryGroup(val key: String, val name: String, val subs: List<SubCategory>)

/** 自定义分类行（只存本机，字段与 storage.ts CustomCat 一致） */
data class CustomCategory(
    val categoryKey: String,
    val categoryName: String,
    val subcategoryKey: String,
    val subcategoryName: String,
)

val DEFAULT_CATEGORIES: List<CategoryGroup> = listOf(
    CategoryGroup("food", "餐饮饮食", listOf(
        SubCategory("breakfast", "早餐"), SubCategory("lunch", "午餐"), SubCategory("dinner", "晚餐"),
        SubCategory("snack", "零食饮料"), SubCategory("takeout", "外卖"), SubCategory("party", "聚餐聚会"),
    )),
    CategoryGroup("transport", "交通出行", listOf(
        SubCategory("bus", "公交地铁"), SubCategory("taxi", "网约车"), SubCategory("fuel", "加油充电"),
        SubCategory("parking", "停车费"), SubCategory("train", "火车高铁"), SubCategory("flight", "飞机"),
    )),
    CategoryGroup("shopping", "购物消费", listOf(
        SubCategory("clothing", "服装鞋帽"), SubCategory("digital", "数码产品"), SubCategory("daily", "日用百货"),
        SubCategory("beauty", "美妆护肤"), SubCategory("luxury", "奢侈品"),
    )),
    CategoryGroup("housing", "住房居家", listOf(
        SubCategory("rent", "房租/房贷"), SubCategory("utility", "水电燃气"), SubCategory("property", "物业费"),
        SubCategory("furniture", "家具家电"), SubCategory("repair", "维修保养"), SubCategory("household", "日用品"),
    )),
    CategoryGroup("entertainment", "娱乐休闲", listOf(
        SubCategory("movie", "电影演出"), SubCategory("travel", "旅游度假"), SubCategory("fitness", "运动健身"),
        SubCategory("game", "游戏充值"), SubCategory("bar", "KTV酒吧"),
    )),
    CategoryGroup("medical", "医疗健康", listOf(
        SubCategory("doctor", "看病就诊"), SubCategory("medicine", "药品购买"), SubCategory("checkup", "体检保健"),
    )),
    CategoryGroup("education", "教育学习", listOf(
        SubCategory("course", "培训课程"), SubCategory("book", "书籍资料"), SubCategory("exam", "考试报名"),
        SubCategory("stationery", "文具用品"),
    )),
    CategoryGroup("social", "人情往来", listOf(
        SubCategory("gift", "红包礼品"), SubCategory("treat", "请客吃饭"), SubCategory("wedding", "婚丧嫁娶"),
        SubCategory("donate", "捐款慈善"),
    )),
    CategoryGroup("finance", "金融保险", listOf(
        SubCategory("insurance", "保险缴费"), SubCategory("invest", "投资理财"), SubCategory("loan", "贷款还款"),
        SubCategory("fee", "手续费"),
    )),
    CategoryGroup("pet", "宠物", listOf(
        SubCategory("pet_food", "宠物食品"), SubCategory("pet_medical", "宠物医疗"), SubCategory("pet_supply", "宠物用品"),
        SubCategory("pet_beauty", "美容洗护"), SubCategory("pet_boarding", "寄养服务"), SubCategory("pet_other", "其他宠物"),
    )),
    CategoryGroup("other", "其他杂项", listOf(
        SubCategory("express", "快递邮寄"), SubCategory("misc", "其他"),
    )),
)

fun getCategoryName(catKey: String): String =
    DEFAULT_CATEGORIES.firstOrNull { it.key == catKey }?.name ?: catKey

fun getSubcategoryName(catKey: String, subKey: String): String =
    DEFAULT_CATEGORIES.firstOrNull { it.key == catKey }?.subs?.firstOrNull { it.key == subKey }?.name ?: subKey

/** 合并分类 = 默认表 + 自定义分类（自定义小类追加到对应大类末尾；新大类追加到表尾）。 */
fun mergedCategories(custom: List<CustomCategory>): List<CategoryGroup> {
    val merged = DEFAULT_CATEGORIES.map { it.copy(subs = it.subs.toList()) }.toMutableList()
    for (cc in custom) {
        val idx = merged.indexOfFirst { it.key == cc.categoryKey }
        if (idx < 0) {
            merged.add(
                CategoryGroup(cc.categoryKey, cc.categoryName, listOf(SubCategory(cc.subcategoryKey, cc.subcategoryName))),
            )
        } else {
            val g = merged[idx]
            if (g.subs.none { it.key == cc.subcategoryKey }) {
                merged[idx] = g.copy(subs = g.subs + SubCategory(cc.subcategoryKey, cc.subcategoryName))
            }
        }
    }
    return merged
}

/** 分类名四元组（待办/周期账单/账单行的公共字段） */
data class CatFields(
    val categoryKey: String = "",
    val categoryName: String = "",
    val subcategoryKey: String = "",
    val subcategoryName: String = "",
)

/**
 * 有 categoryKey，且一级或二级名为空时，按分类表补全；查不到用 key 本身。
 * 用在：应用云端实体快照、周期账单记账、待办完成记账（开发文档 §7.3）。
 */
fun fillCatNames(item: CatFields, cats: List<CategoryGroup> = DEFAULT_CATEGORIES): CatFields {
    if (item.categoryKey.isEmpty() || (item.categoryName.isNotEmpty() && item.subcategoryName.isNotEmpty())) return item
    val c = cats.firstOrNull { it.key == item.categoryKey }
    val s = c?.subs?.firstOrNull { it.key == item.subcategoryKey }
    return item.copy(
        categoryName = item.categoryName.ifEmpty { c?.name ?: item.categoryKey },
        subcategoryName = item.subcategoryName.ifEmpty { s?.name ?: item.subcategoryKey },
    )
}
