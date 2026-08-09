import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api'

interface Rule {
  id: number; keyword: string; match_type: string; reply_text: string
  priority: number; match_mode: string; delay_min: number; delay_max: number
  cooldown: number; scope: string; is_active: number; total_matches: number
  created_at: string; updated_at: string
}

interface LogEntry {
  id: number; account_id: number; rule_id: number; from_user_id: string
  from_user_name: string; keyword: string; reply_text: string
  chat_type: string; created_at: string; rule_keyword: string
  account_phone: string; account_name: string
}

const DEFAULT_FORM = {
  keyword: '', match_type: 'contains', reply_text: '', priority: 0,
  match_mode: 'any', delay_min: 0, delay_max: 1, cooldown: 0, scope: 'all', is_active: 1
}

type SubTab = 'rules' | 'logs' | 'test'

export default function BotSettingsPage() {
  const navigate = useNavigate()
  const [subTab, setSubTab] = useState<SubTab>('rules')
  const [botEnabled, setBotEnabled] = useState(true)
  const [rules, setRules] = useState<Rule[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState({ ...DEFAULT_FORM })
  const [testText, setTestText] = useState('')
  const [testResult, setTestResult] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const loadAll = async () => {
    try {
      const [status, rulesData] = await Promise.all([
        api.getGlobalBotStatus(),
        api.getGlobalRules()
      ])
      setBotEnabled(status.enabled)
      setRules(rulesData)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  const loadLogs = async () => {
    try { setLogs(await api.getGlobalBotLogs(200)) } catch (e) { console.error(e) }
  }

  useEffect(() => { if (subTab === 'logs') loadLogs() }, [subTab])

  const handleToggle = async () => {
    const newVal = !botEnabled
    await api.setGlobalBotStatus(newVal)
    setBotEnabled(newVal)
  }

  const handleCreate = async () => {
    if (!form.keyword || !form.reply_text) return
    await api.createGlobalRule(form)
    setShowForm(false); setForm({ ...DEFAULT_FORM }); loadAll()
  }

  const handleUpdate = async () => {
    if (!editId) return
    await api.updateRule(editId, form)
    setEditId(null); setShowForm(false); setForm({ ...DEFAULT_FORM }); loadAll()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此规则？')) return
    await api.deleteRule(id); loadAll()
  }

  const startEdit = (rule: Rule) => {
    setEditId(rule.id)
    setForm({
      keyword: rule.keyword, match_type: rule.match_type, reply_text: rule.reply_text,
      priority: rule.priority, match_mode: rule.match_mode, delay_min: rule.delay_min,
      delay_max: rule.delay_max, cooldown: rule.cooldown, scope: rule.scope, is_active: rule.is_active
    })
    setShowForm(true)
  }

  const handleTestMatch = async () => {
    if (!testText.trim()) return
    const res = await api.testGlobalMatch(testText)
    setTestResult(res)
  }

  const handleClearLogs = async () => {
    if (!confirm('确定清空所有日志？')) return
    await api.clearGlobalBotLogs(); loadLogs()
  }

  if (loading) return <div className="flex-1 flex items-center justify-center text-gray-400">加载中...</div>

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-600 p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span className="text-2xl">🤖</span>
          <h1 className="text-xl font-bold text-gray-800">Bot 全局管理</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{botEnabled ? '已启用' : '已停用'}</span>
          <button onClick={handleToggle}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${botEnabled ? 'bg-blue-500' : 'bg-gray-300'}`}>
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow ${botEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        {/* Sub-tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 w-fit">
          {([['rules', '规则管理'], ['logs', '触发日志'], ['test', '测试匹配']] as [SubTab, string][]).map(([key, label]) => (
            <button key={key} onClick={() => setSubTab(key)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition ${subTab === key ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* ─── Rules Tab ─── */}
        {subTab === 'rules' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">全局规则将应用于所有已登录且启用的账号</p>
              <button onClick={() => { setShowForm(true); setEditId(null); setForm({ ...DEFAULT_FORM }) }}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
                + 添加规则
              </button>
            </div>

            {rules.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
                <div className="text-4xl mb-3">📭</div>
                <p className="text-gray-500">还没有全局规则</p>
                <p className="text-sm text-gray-400 mt-1">点击「添加规则」创建第一条</p>
              </div>
            ) : (
              <div className="space-y-3">
                {rules.map(rule => (
                  <div key={rule.id} className="bg-white border border-gray-100 rounded-xl p-4 hover:shadow-sm transition">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${rule.is_active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                            {rule.is_active ? '启用' : '停用'}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-500">{rule.match_type}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-500">{rule.scope}</span>
                        </div>
                        <div className="text-sm font-medium text-gray-800 mb-1">
                          关键词：<code className="bg-gray-100 px-1.5 py-0.5 rounded text-blue-600">{rule.keyword}</code>
                        </div>
                        <div className="text-sm text-gray-600 truncate">
                          回复：{rule.reply_text}
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                          <span>延迟 {rule.delay_min}-{rule.delay_max}s</span>
                          <span>冷却 {rule.cooldown}s</span>
                          <span>匹配 {rule.total_matches} 次</span>
                          <span>优先级 {rule.priority}</span>
                        </div>
                      </div>
                      <div className="flex gap-1 ml-3 shrink-0">
                        <button onClick={() => startEdit(rule)} className="text-blue-500 hover:bg-blue-50 p-2 rounded-lg transition text-sm">编辑</button>
                        <button onClick={() => handleDelete(rule.id)} className="text-red-400 hover:bg-red-50 p-2 rounded-lg transition text-sm">删除</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Rule Form Modal */}
            {showForm && (
              <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                  <div className="px-6 pt-6 pb-4">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">{editId ? '编辑规则' : '新建规则'}</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">关键词</label>
                        <input value={form.keyword} onChange={e => setForm({ ...form, keyword: e.target.value })}
                          placeholder="多个关键词用逗号分隔" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-blue-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">回复内容</label>
                        <textarea value={form.reply_text} onChange={e => setForm({ ...form, reply_text: e.target.value })}
                          placeholder="支持变量: {name} {text} {keyword}" rows={3}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-blue-500" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">匹配类型</label>
                          <select value={form.match_type} onChange={e => setForm({ ...form, match_type: e.target.value })}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-blue-500">
                            <option value="contains">包含</option>
                            <option value="exact">精确匹配</option>
                            <option value="starts">开头匹配</option>
                            <option value="ends">结尾匹配</option>
                            <option value="regex">正则表达式</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">匹配模式</label>
                          <select value={form.match_mode} onChange={e => setForm({ ...form, match_mode: e.target.value })}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-blue-500">
                            <option value="any">任一匹配</option>
                            <option value="all">全部匹配</option>
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">最小延迟(秒)</label>
                          <input type="number" value={form.delay_min} onChange={e => setForm({ ...form, delay_min: parseInt(e.target.value) || 0 })}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-blue-500" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">最大延迟(秒)</label>
                          <input type="number" value={form.delay_max} onChange={e => setForm({ ...form, delay_max: parseInt(e.target.value) || 1 })}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-blue-500" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">冷却(秒)</label>
                          <input type="number" value={form.cooldown} onChange={e => setForm({ ...form, cooldown: parseInt(e.target.value) || 0 })}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-blue-500" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">适用范围</label>
                          <select value={form.scope} onChange={e => setForm({ ...form, scope: e.target.value })}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-blue-500">
                            <option value="all">全部</option>
                            <option value="private">私聊</option>
                            <option value="group">群聊</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">优先级</label>
                          <input type="number" value={form.priority} onChange={e => setForm({ ...form, priority: parseInt(e.target.value) || 0 })}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-blue-500" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="px-6 pb-5 flex gap-3 justify-end">
                    <button onClick={() => { setShowForm(false); setEditId(null) }}
                      className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition">取消</button>
                    <button onClick={editId ? handleUpdate : handleCreate}
                      className="px-5 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition">
                      {editId ? '保存' : '创建'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Logs Tab ─── */}
        {subTab === 'logs' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">所有账号的 Bot 触发记录</p>
              <div className="flex gap-2">
                <button onClick={loadLogs} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 border border-gray-200 rounded-lg transition">刷新</button>
                <button onClick={handleClearLogs} className="text-sm text-red-500 hover:bg-red-50 px-3 py-1.5 border border-red-200 rounded-lg transition">清空日志</button>
              </div>
            </div>
            {logs.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
                <div className="text-4xl mb-3">📋</div>
                <p className="text-gray-500">暂无日志</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="text-left px-4 py-3 text-gray-500 font-medium">时间</th>
                        <th className="text-left px-4 py-3 text-gray-500 font-medium">账号</th>
                        <th className="text-left px-4 py-3 text-gray-500 font-medium">发送者</th>
                        <th className="text-left px-4 py-3 text-gray-500 font-medium">关键词</th>
                        <th className="text-left px-4 py-3 text-gray-500 font-medium">回复内容</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map(log => (
                        <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{new Date(log.created_at + 'Z').toLocaleString('zh-CN')}</td>
                          <td className="px-4 py-3 text-gray-700">{log.account_name || log.account_phone || `#${log.account_id}`}</td>
                          <td className="px-4 py-3 text-gray-700">{log.from_user_name || log.from_user_id || '-'}</td>
                          <td className="px-4 py-3"><code className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded text-xs">{log.keyword}</code></td>
                          <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{log.reply_text}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Test Tab ─── */}
        {subTab === 'test' && (
          <div>
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">输入测试文本，检查匹配哪些全局规则</h3>
              <div className="flex gap-3">
                <input value={testText} onChange={e => setTestText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleTestMatch() }}
                  placeholder="输入要测试的消息..."
                  className="flex-1 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:border-blue-500" />
                <button onClick={handleTestMatch}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition">
                  测试
                </button>
              </div>
              {testResult && (
                <div className="mt-5">
                  <div className="text-sm font-medium text-gray-700 mb-2">
                    匹配结果：{testResult.count} 条规则命中
                  </div>
                  {testResult.count === 0 ? (
                    <p className="text-sm text-gray-400">没有匹配的规则</p>
                  ) : (
                    <div className="space-y-2">
                      {testResult.matched.map((m: any) => (
                        <div key={m.id} className="bg-green-50 border border-green-100 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-600">✓ {m.match_type}</span>
                            <code className="text-sm text-green-700">{m.keyword}</code>
                          </div>
                          <div className="text-sm text-gray-600">→ {m.reply_text}</div>
                          <div className="text-xs text-gray-400 mt-1">延迟 {m.delay_min}-{m.delay_max}s · 冷却 {m.cooldown}s · 范围 {m.scope}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
