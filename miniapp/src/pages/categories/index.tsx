import { View, Text, Input, Picker } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { getMergedCategories, addCustomCategory, deleteCustomCategory, isCustomCategory } from '../../utils/storage'
import { useThemeDark } from '../../utils/theme'
import './index.scss'

const MAJORS = [
  { key: 'food', name: '餐饮饮食' }, { key: 'transport', name: '交通出行' },
  { key: 'shopping', name: '购物消费' }, { key: 'housing', name: '住房居家' },
  { key: 'entertainment', name: '娱乐休闲' }, { key: 'medical', name: '医疗健康' },
  { key: 'education', name: '教育学习' }, { key: 'social', name: '人情往来' },
  { key: 'finance', name: '金融保险' }, { key: 'pet', name: '宠物' },
  { key: 'other', name: '其他杂项' },
]

export default function Categories(): JSX.Element {
  const dark = useThemeDark()
  const [cats, setCats] = useState<any[]>([])
  const [editingGroup, setEditingGroup] = useState<string | null>(null)  // 正在添加的大类 key
  const [subName, setSubName] = useState('')
  const [customKeys, setCustomKeys] = useState<Set<string>>(new Set())
  // 用于添加全新大类
  const [showNewMajor, setShowNewMajor] = useState(false)
  const [newMajorName, setNewMajorName] = useState('')
  const [newSubName, setNewSubName] = useState('')

  async function loadCats(): Promise<void> {
    const merged = await getMergedCategories()
    setCats(merged)
    const keys = new Set<string>()
    for (const c of merged) {
      for (const s of c.subs) {
        if (await isCustomCategory(s.key)) keys.add(s.key)
      }
    }
    setCustomKeys(keys)
  }

  useDidShow(() => { loadCats() })

  // 给指定大类添加二级小类
  async function handleAddSub(majorKey: string): Promise<void> {
    if (!subName.trim()) { Taro.showToast({ title: '请输入分类名', icon: 'none' }); return }
    const m = MAJORS.find((x) => x.key === majorKey)!
    const subKey = `${majorKey}_${Date.now()}`
    await addCustomCategory(majorKey, m.name, subKey, subName.trim())
    await loadCats()
    setEditingGroup(null)
    setSubName('')
    Taro.eventCenter.trigger('dataChanged')
    Taro.showToast({ title: '已添加', icon: 'success' })
  }

  // 添加一个全新大类（同时创建第一个小类）
  async function handleAddMajor(): Promise<void> {
    const mn = newMajorName.trim()
    const sn = newSubName.trim()
    if (!mn) { Taro.showToast({ title: '请输入大类名称', icon: 'none' }); return }
    if (!sn) { Taro.showToast({ title: '请输入小类名称', icon: 'none' }); return }
    const majorKey = `custom_${Date.now()}`
    const subKey = `${majorKey}_${Date.now() + 1}`
    await addCustomCategory(majorKey, mn, subKey, sn)
    await loadCats()
    setShowNewMajor(false)
    setNewMajorName('')
    setNewSubName('')
    Taro.eventCenter.trigger('dataChanged')
    Taro.showToast({ title: '已添加', icon: 'success' })
  }

  async function handleDelete(subKey: string): Promise<void> {
    if (!customKeys.has(subKey)) { Taro.showToast({ title: '默认分类不可删', icon: 'none' }); return }
    Taro.showModal({
      title: '确定删除？',
      success: async (res) => {
        if (res.confirm) { await deleteCustomCategory(subKey); await loadCats(); Taro.eventCenter.trigger('dataChanged') }
      },
    })
  }

  return (
    <View className={`wrap${dark ? ' theme-dark' : ''}`}>
      {/* 顶栏 */}
      <View className='header-row'>
        <Text className='page-title'>分类管理</Text>
        <Text className='add-major-btn' onClick={() => setShowNewMajor(true)}>+ 新大类</Text>
      </View>

      {/* 添加新大类弹窗 */}
      {showNewMajor && (
        <View className='add-card'>
          <Text className='add-card-title'>添加新大类及第一个小类</Text>
          <View className='form-row'>
            <Text className='label'>大类名称</Text>
            <Input className='input' placeholder='如：育儿' value={newMajorName} onInput={(e) => setNewMajorName(e.detail.value)} maxlength={10} />
          </View>
          <View className='form-row'>
            <Text className='label'>小类名称</Text>
            <Input className='input' placeholder='如：猫粮' value={newSubName} onInput={(e) => setNewSubName(e.detail.value)} maxlength={10} />
          </View>
          <View className='add-actions'>
            <Text className='cancel-btn' onClick={() => { setShowNewMajor(false); setNewMajorName(''); setNewSubName('') }}>取消</Text>
            <Text className='ok-btn' onClick={handleAddMajor}>确认添加</Text>
          </View>
        </View>
      )}

      {/* 分类列表 */}
      {cats.map((cat) => (
        <View key={cat.key} className='cat-group'>
          {/* 组头 */}
          <View className='group-header'>
            <Text className='group-title'>{cat.name}</Text>
            <Text className='add-sub-btn' onClick={() => { setEditingGroup(editingGroup === cat.key ? null : cat.key); setSubName('') }}>
              {editingGroup === cat.key ? '取消' : '+ 添加小类'}
            </Text>
          </View>

          {/* 添加表单：出现在对应大类下方 */}
          {editingGroup === cat.key && (
            <View className='inline-add'>
              <Text className='inline-label'>添加到「{cat.name}」</Text>
              <View className='inline-row'>
                <Input className='inline-input' placeholder='小类名称' value={subName} onInput={(e) => setSubName(e.detail.value)} maxlength={8} />
                <Text className='inline-ok' onClick={() => handleAddSub(cat.key)}>确认</Text>
              </View>
            </View>
          )}

          {/* 小类列表 */}
          <View className='sub-list'>
            {cat.subs.map((s) => (
              <View key={s.key} className={`sub-tag ${customKeys.has(s.key) ? 'custom' : ''}`}>
                <Text>{s.name}</Text>
                {customKeys.has(s.key) && <Text className='del-icon' onClick={() => handleDelete(s.key)}>×</Text>}
              </View>
            ))}
          </View>
        </View>
      ))}

      <View className='tip'><Text>带 × 号的可删除（自定义分类），其余为默认分类不可删除</Text></View>
    </View>
  )
}
