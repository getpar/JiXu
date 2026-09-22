import { View, Text, Input, Picker, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState, useEffect } from 'react'
import { getMergedCategories, addRecord, getRecords } from '../../utils/storage'
import { useThemeDark } from '../../utils/theme'
import './index.scss'

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Add(): JSX.Element {
  const dark = useThemeDark()
  const [type, setType] = useState<'expense' | 'income'>('expense')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today())
  const [catKey, setCatKey] = useState('')
  const [subKey, setSubKey] = useState('')
  const [note, setNote] = useState('')
  // v0.8.0 记录人：可选"谁花的"+ 历史常用快捷选项
  const [person, setPerson] = useState('')
  const [freqPersons, setFreqPersons] = useState<string[]>([])
  // v0.8.1 拍照凭证：拍小票/选相册，持久存到本机用户目录（不上云，换手机不带走）
  const [photo, setPhoto] = useState('')
  const [cats, setCats] = useState<any[]>([])

  useEffect(() => { getMergedCategories().then(setCats) }, [])
  useEffect(() => { loadFreqPersons() }, [])

  async function loadFreqPersons(): Promise<void> {
    const rs = await getRecords()
    const cnt: Record<string, number> = {}
    rs.forEach((r) => { if (r.person) cnt[r.person] = (cnt[r.person] || 0) + 1 })
    setFreqPersons(Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]).slice(0, 6))
  }

  /** v0.8.1 选照片后复制到用户目录持久保存（临时文件重启即失效，不能直接存路径） */
  function choosePhoto(): void {
    Taro.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['album', 'camera'], sizeType: ['compressed'] })
      .then((res) => {
        const tmp = res.tempFiles[0].tempFilePath
        const fs = Taro.getFileSystemManager()
        const dir = `${Taro.env.USER_DATA_PATH}/photos`
        try { fs.mkdirSync(dir, true) } catch { /* 已存在 */ }
        const dest = `${dir}/${Date.now()}.jpg`
        fs.copyFile({
          srcPath: tmp, destPath: dest,
          success: () => setPhoto(dest),
          fail: () => Taro.showToast({ title: '照片保存失败', icon: 'none' }),
        })
      })
      .catch(() => { /* 用户取消 */ })
  }

  const currentCat = cats.find((c: any) => c.key === catKey)
  const subs = currentCat?.subs || []

  async function submit(): Promise<void> {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { Taro.showToast({ title: '请输入金额', icon: 'none' }); return }
    if (!catKey) { Taro.showToast({ title: '请选择分类', icon: 'none' }); return }
    if (!subKey) { Taro.showToast({ title: '请选择子分类', icon: 'none' }); return }

    await addRecord({
      type,
      amount: amt,
      categoryKey: catKey,
      categoryName: currentCat!.name,
      subcategoryKey: subKey,
      subcategoryName: subs.find((s) => s.key === subKey)!.name,
      note,
      person: person.trim(),
      photo,
      date,
    })

    Taro.showToast({ title: '记账成功！', icon: 'success' })
    setAmount(''); setCatKey(''); setSubKey(''); setNote(''); setPerson(''); setPhoto(''); setDate(today())
    loadFreqPersons()
    Taro.eventCenter.trigger('dataChanged')
  }

  return (
    <View className={`wrap${dark ? ' theme-dark' : ''}`}>
      {/* 类型切换 */}
      <View className='type-switch'>
        <View className={`type-btn ${type === 'expense' ? 'active expense' : ''}`} onClick={() => setType('expense')}><Text>支出</Text></View>
        <View className={`type-btn ${type === 'income' ? 'active income' : ''}`} onClick={() => setType('income')}><Text>收入</Text></View>
      </View>

      {/* 金额 */}
      <View className='card'>
        <Text className='label'>金额</Text>
        <View className='amount-row'>
          <Text className='currency'>¥</Text>
          <Input className='amount-input' type='digit' placeholder='0.00' value={amount} onInput={(e) => setAmount(e.detail.value)} focus />
        </View>
      </View>

      {/* 日期 */}
      <View className='card'>
        <Text className='label'>日期</Text>
        <Picker mode='date' value={date} onChange={(e) => setDate(e.detail.value)}>
          <View className='picker'><Text>{date}</Text><Text className='arrow'>›</Text></View>
        </Picker>
      </View>

      {/* 一级分类 */}
      <View className='card'>
        <Text className='label'>一级分类</Text>
        <Picker mode='selector' range={cats} rangeKey='name' onChange={(e) => { setCatKey(cats[Number(e.detail.value)].key); setSubKey('') }}>
          <View className='picker'><Text className={catKey ? '' : 'placeholder'}>{currentCat?.name || '选择大类'}</Text><Text className='arrow'>›</Text></View>
        </Picker>
      </View>

      {/* 二级分类 */}
      {currentCat && (
        <View className='card'>
          <Text className='label'>二级分类</Text>
          <View className='sub-grid'>
            {subs.map((s) => (
              <View key={s.key} className={`sub-item ${subKey === s.key ? 'sub-active' : ''}`} onClick={() => setSubKey(s.key)}>
                <Text>{s.name}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* 记录人（v0.8.0） */}
      <View className='card'>
        <Text className='label'>谁花的（可选）</Text>
        {freqPersons.length > 0 && (
          <View className='person-chips'>
            {freqPersons.map((p) => (
              <View key={p} className={`person-chip${person === p ? ' person-chip-active' : ''}`} onClick={() => setPerson(person === p ? '' : p)}>
                <Text>{p}</Text>
              </View>
            ))}
          </View>
        )}
        <Input className='note-input' placeholder='如：爸爸、妈妈、我...' value={person} onInput={(e) => setPerson(e.detail.value)} maxlength={10} />
      </View>

      {/* 拍照凭证（v0.8.1） */}
      <View className='card'>
        <Text className='label'>小票照片（可选，只存本机）</Text>
        {photo ? (
          <View className='photo-wrap'>
            <Image src={photo} className='photo-thumb' mode='aspectFill' onClick={() => Taro.previewImage({ current: photo, urls: [photo] })} />
            <View className='photo-del' onClick={() => setPhoto('')}><Text>×</Text></View>
          </View>
        ) : (
          <View className='photo-add' onClick={choosePhoto}><Text>拍小票 / 选照片</Text></View>
        )}
      </View>

      {/* 备注 */}
      <View className='card'>
        <Text className='label'>备注</Text>
        <Input className='note-input' placeholder='可选：添加备注...' value={note} onInput={(e) => setNote(e.detail.value)} maxlength={200} />
      </View>

      {/* 提交 */}
      <View className='submit-btn' onClick={submit}><Text>保存记录</Text></View>
    </View>
  )
}
