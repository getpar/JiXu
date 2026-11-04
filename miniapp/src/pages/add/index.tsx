import { View, Text, Input, Picker, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState, useEffect, useMemo, useRef } from 'react'
import { getMergedCategories, addRecord, getRecords, deleteRecord } from '../../utils/storage'
import type { CategoryGroup } from '../../utils/storage'
import { useThemeDark } from '../../utils/theme'
import { formatMoneyExact, parseAmountInput, sanitizeAmountInput, AMOUNT_INPUT_MAX_LENGTH } from '../../utils/money'
import './index.scss'

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** v0.9.1 撤销回填用的提交快照 */
interface SubmitSnapshot {
  type: 'expense' | 'income'
  amount: number
  categoryKey: string
  subcategoryKey: string
  note: string
  person: string
  photo: string
  date: string
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
  const [cats, setCats] = useState<CategoryGroup[]>([])
  // v0.9.1 常用分类置顶：按使用频次排序，常用的一级/二级分类排前面
  const [catCount, setCatCount] = useState<Record<string, number>>({})
  const [subCount, setSubCount] = useState<Record<string, number>>({})
  // v0.9.1 记账后撤销：保存后 5 秒内可一键撤销
  const [undo, setUndo] = useState<{ id: string; label: string } | null>(null)
  const [undoSecs, setUndoSecs] = useState(5)
  const lastSnapshot = useRef<SubmitSnapshot | null>(null)

  // v0.9.6 记一笔是常驻内存的 tab 页：每次切回来重读分类（分类页新加的小类立刻能选）；
  // 日期若还是上次自动填的「今天」而日子已经变了（隔夜没关小程序），换成新的今天，用户手动选过的日期不动
  const autoDate = useRef(date)
  useDidShow(() => {
    getMergedCategories().then(setCats)
    const t = today()
    if (t !== autoDate.current) {
      const prevAuto = autoDate.current
      autoDate.current = t
      setDate((cur) => (cur === prevAuto ? t : cur))
    }
  })
  useEffect(() => { loadFreqPersons() }, [])
  useEffect(() => { loadFreq() }, [type])

  async function loadFreqPersons(): Promise<void> {
    const rs = await getRecords()
    const cnt: Record<string, number> = {}
    rs.forEach((r) => { if (r.person) cnt[r.person] = (cnt[r.person] || 0) + 1 })
    setFreqPersons(Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]).slice(0, 6))
  }

  /** v0.9.1 统计当前类型下各一级/二级分类的使用次数（用于置顶排序） */
  async function loadFreq(): Promise<void> {
    const rs = await getRecords()
    const cc: Record<string, number> = {}
    const sc: Record<string, number> = {}
    rs.forEach((r) => {
      if (r.type !== type) return
      cc[r.categoryKey] = (cc[r.categoryKey] || 0) + 1
      sc[r.subcategoryKey] = (sc[r.subcategoryKey] || 0) + 1
    })
    setCatCount(cc); setSubCount(sc)
  }

  // v0.9.1 撤销条倒计时：5 秒后自动收起（用截止时间，避免后台切换导致计时漂移）
  useEffect(() => {
    if (!undo) return
    const deadline = Date.now() + 5000
    setUndoSecs(5)
    const t = setInterval(() => {
      const left = Math.ceil((deadline - Date.now()) / 1000)
      if (left <= 0) { clearInterval(t); setUndo(null) }
      else setUndoSecs(left)
    }, 250)
    return () => clearInterval(t)
  }, [undo?.id])

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

  // v0.9.1 常用一级分类（最多 4 个，点击直接选中）
  const freqCats = useMemo(() => {
    return Object.keys(catCount)
      .sort((a, b) => catCount[b] - catCount[a])
      .slice(0, 4)
      .map((k) => cats.find((c: any) => c.key === k))
      .filter(Boolean)
  }, [catCount, cats])

  // v0.9.1 二级分类按使用频次置顶（次数相同保持原顺序）
  const subsSorted = useMemo(() => {
    return [...subs].sort((a: any, b: any) => (subCount[b.key] || 0) - (subCount[a.key] || 0))
  }, [subs, subCount])

  async function submit(): Promise<void> {
    // v0.9.5 金额边界校验：parseAmountInput 取代 parseFloat —— 严格卡格式（挡掉 1e5 / 12.3.4）
    // 并校验 >0 与单笔上限，避免把天文数字写进账本（旧实现只判 >0，线上已出现 1.1e125 的记录）
    const parsed = parseAmountInput(amount)
    if (!parsed.ok) { Taro.showToast({ title: parsed.message, icon: 'none' }); return }
    const amt = parsed.value
    if (!catKey) { Taro.showToast({ title: '请选择分类', icon: 'none' }); return }
    if (!subKey) { Taro.showToast({ title: '请选择子分类', icon: 'none' }); return }

    const payload = {
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
    }
    const id = await addRecord(payload)
    lastSnapshot.current = { type, amount: amt, categoryKey: catKey, subcategoryKey: subKey, note, person: person.trim(), photo, date }

    const t = today()
    autoDate.current = t
    setAmount(''); setCatKey(''); setSubKey(''); setNote(''); setPerson(''); setPhoto(''); setDate(t)
    loadFreqPersons(); loadFreq()
    Taro.eventCenter.trigger('dataChanged')
    // v0.9.1 不再弹"记账成功"toast，改弹可撤销条
    setUndo({ id, label: `${type === 'income' ? '收入' : '支出'} ¥${formatMoneyExact(amt)}` })
  }

  /** v0.9.1 撤销刚记的这笔：删除记录并把表单回填成刚才的内容，方便改后重记 */
  async function undoLast(): Promise<void> {
    if (!undo) return
    const id = undo.id
    const snap = lastSnapshot.current
    setUndo(null)
    await deleteRecord(id)
    Taro.eventCenter.trigger('dataChanged')
    if (snap) {
      setType(snap.type); setAmount(String(snap.amount)); setCatKey(snap.categoryKey)
      setSubKey(snap.subcategoryKey); setNote(snap.note); setPerson(snap.person)
      setPhoto(snap.photo); setDate(snap.date)
    }
    Taro.showToast({ title: '已撤销，可改后重记', icon: 'none' })
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
          <Input className='amount-input' type='digit' maxlength={AMOUNT_INPUT_MAX_LENGTH} placeholder='0.00' value={amount} onInput={(e) => setAmount(sanitizeAmountInput(e.detail.value))} focus />
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
        {/* v0.9.1 常用分类置顶：点一下直接选中 */}
        {freqCats.length > 0 && (
          <View className='cat-chips'>
            {freqCats.map((c: any) => (
              <View key={c.key} className={`cat-chip${catKey === c.key ? ' active' : ''}`} onClick={() => { setCatKey(c.key); setSubKey('') }}>
                <Text>{c.name}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* 二级分类 */}
      {currentCat && (
        <View className='card'>
          <Text className='label'>二级分类</Text>
          <View className='sub-grid'>
            {subsSorted.map((s) => (
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

      {/* v0.9.1 撤销条：5 秒内可一键撤销刚记的这笔 */}
      {undo && (
        <View className='undo-bar'>
          <Text className='undo-text'>已记 {undo.label}</Text>
          <View className='undo-btn' onClick={undoLast}><Text className='undo-btn-text'>{undoSecs}s 撤销</Text></View>
        </View>
      )}
    </View>
  )
}
