import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../services/api'

interface Dialog { id: string; name: string; lastMessage: string; lastMessageDate: number; unreadCount: number; isGroup: boolean }
interface Message { id: number; chatId: string; text: string; date: number; isOut: boolean; senderId: string; senderName: string }
interface BotRule { id: number; keyword: string; match_type: string; reply_text: string; is_active: number; match_count: number; priority: number; match_mode: string }

type Tab = 'chat' | 'bot'

export default function AccountDetailPage() {
  const { id } = useParams()
  const accountId = parseInt(id!)
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('chat')
  const [account, setAccount] = useState<any>(null)
  const [dialogs, setDialogs] = useState<Dialog[]>([])
  const [selectedChat, setSelectedChat] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMsg, setNewMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [msgLoading, setMsgLoading] = useState(false)
  const msgEndRef = useRef<HTMLDivElement>(null)

  // Bot state
  const [rules, setRules] = useState<BotRule[]>([])
  const [showRuleForm, setShowRuleForm] = useState(false)
  const [ruleForm, setRuleForm] = useState({ keyword: '', reply_text: '', priority: 0, match_mode: 'any', match_type: 'contains' })

  useEffect(() => {
    loadAccount()
    loadDialogs()
  }, [accountId])

  useEffect(() => {
    if (selectedChat) loadMessages()
  }, [selectedChat])

  useEffect(() => {
    if (tab === 'bot') loadRules()
  }, [tab])

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadAccount = async () => {
    const accs = await api.getAccounts()
    const acc = accs.find((a: any) => a.id === accountId)
    setAccount(acc)
  }

  const loadDialogs = async () => {
    try {
      const data = await api.getDialogs(accountId)
      setDialogs(data)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const loadMessages = async () => {
    setMsgLoading(true)
    try {
      const data = await api.getMessages(accountId, selectedChat!)
      setMessages(data.reverse())
    } catch (e) { console.error(e) }
    setMsgLoading(false)
  }

  const loadRules = async () => {
    const data = await api.getRules(accountId)
    setRules(data)
  }

  const handleSend = async () => {
    if (!newMsg.trim() || !selectedChat) return
    await api.sendMessage(accountId, selectedChat, newMsg)
    setNewMsg('')
    loadMessages()
  }

  const handleCreateRule = async () => {
    await api.createRule(accountId, ruleForm)
    setShowRuleForm(false)
    setRuleForm({ keyword: '', reply_text: '', priority: 0, match_mode: 'any', match_type: 'contains' })
    loadRules()
  }

  const handleDeleteRule = async (ruleId: number) => {
    if (!confirm('确定删除此规则？')) return
    await api.deleteRule(ruleId)
    loadRules()
  }

  const handleToggleRule = async (rule: BotRule) => {
    await api.updateRule(rule.id, { ...rule, is_active: rule.is_active ? 0 : 1 })
    loadRules()
  }

  const formatDate = (ts: number) => {
    if (!ts) return ''
    const d = new Date(ts * 1000)
    const now = new Date()
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }

  const selectedDialog = dialogs.find(d => d.id === selectedChat)

  return (
    <div className="h-screen bg-dark-900 flex flex-col">
      {/* Header */}
      <header className="bg-dark-800 border-b border-dark-700 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/admin/')} className="text-dark-400 hover:text-white transition text-sm">← 返回</button>
          <span className="text-lg">👤</span>
          <div>
            <div className="font-medium text-white text-sm">{account?.first_name || account?.phone || '加载中'}</div>
            <div className="text-xs text-dark-400">@{account?.username || ''} · 端口 {account?.client_port}</div>
          </div>
        </div>
        <div className="flex gap-1 bg-dark-700 rounded-lg p-1">
          <button onClick={() => setTab('chat')} className={`px-3 py-1.5 rounded-md text-sm transition ${tab === 'chat' ? 'bg-primary text-white' : 'text-dark-300 hover:text-white'}`}>
            💬 聊天
          </button>
          <button onClick={() => setTab('bot')} className={`px-3 py-1.5 rounded-md text-sm transition ${tab === 'bot' ? 'bg-primary text-white' : 'text-dark-300 hover:text-white'}`}>
            🤖 Bot
          </button>
        </div>
      </header>

      {tab === 'chat' ? (
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar - Dialogs */}
          <div className="w-80 bg-dark-800 border-r border-dark-700 flex flex-col shrink-0">
            <div className="p-3 border-b border-dark-700">
              <h3 className="text-sm font-medium text-dark-300">会话列表</h3>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? <div className="p-4 text-center text-dark-500 text-sm">加载中...</div> :
                dialogs.length === 0 ? <div className="p-4 text-center text-dark-500 text-sm">暂无会话</div> :
                dialogs.map(d => (
                  <div key={d.id} onClick={() => setSelectedChat(d.id)}
                    className={`px-4 py-3 border-b border-dark-700/50 cursor-pointer transition ${selectedChat === d.id ? 'bg-primary/10 border-l-2 border-l-primary' : 'hover:bg-dark-700/50'}`}>
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-medium text-white text-sm truncate">{d.name}</span>
                      <span className="text-xs text-dark-500 shrink-0 ml-2">{formatDate(d.lastMessageDate)}</span>
                    </div>
                    <p className="text-xs text-dark-400 truncate">{d.lastMessage || '暂无消息'}</p>
                    {d.unreadCount > 0 && (
                      <span className="inline-block mt-1 bg-primary text-white text-xs rounded-full px-2 py-0.5">{d.unreadCount}</span>
                    )}
                  </div>
                ))
              }
            </div>
          </div>

          {/* Main - Messages */}
          <div className="flex-1 flex flex-col bg-dark-900">
            {selectedChat ? (
              <>
                <div className="bg-dark-800 border-b border-dark-700 px-4 py-3 shrink-0">
                  <div className="font-medium text-white text-sm">{selectedDialog?.name || selectedChat}</div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {msgLoading ? <div className="text-center text-dark-500 text-sm py-8">加载中...</div> :
                    messages.map(m => (
                      <div key={m.id} className={`flex ${m.isOut ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[70%] rounded-xl px-3 py-2 ${m.isOut ? 'bg-primary text-white' : 'bg-dark-700 text-white'}`}>
                          <p className="text-sm whitespace-pre-wrap break-words">{m.text || '[媒体消息]'}</p>
                          <p className={`text-xs mt-1 ${m.isOut ? 'text-blue-200' : 'text-dark-400'}`}>
                            {formatDate(m.date)}
                          </p>
                        </div>
                      </div>
                    ))
                  }
                  <div ref={msgEndRef} />
                </div>
                <div className="bg-dark-800 border-t border-dark-700 p-3 shrink-0">
                  <div className="flex gap-2">
                    <input value={newMsg} onChange={e => setNewMsg(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSend()}
                      placeholder="输入消息..." className="flex-1 bg-dark-900 border border-dark-600 rounded-lg px-4 py-2.5 text-white text-sm placeholder-dark-500 focus:outline-none focus:border-primary" />
                    <button onClick={handleSend} className="bg-primary hover:bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition">
                      发送
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-dark-500">
                <div className="text-center">
                  <div className="text-4xl mb-3">💬</div>
                  <p>选择一个会话开始查看消息</p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Bot Settings Tab */
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">Bot 自动回复规则</h2>
              <button onClick={() => setShowRuleForm(true)}
                className="bg-primary hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
                + 新建规则
              </button>
            </div>

            {rules.length === 0 ? (
              <div className="text-center py-16 text-dark-400">
                <div className="text-4xl mb-3">🤖</div>
                <p>暂无自动回复规则</p>
              </div>
            ) : (
              <div className="space-y-3">
                {rules.map(rule => (
                  <div key={rule.id} className="bg-dark-800 border border-dark-700 rounded-xl p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="bg-primary/20 text-primary text-xs px-2 py-0.5 rounded">
                            {rule.match_type === 'regex' ? '正则' : '关键词'}
                          </span>
                          <span className="bg-dark-600 text-dark-200 text-xs px-2 py-0.5 rounded">
                            {rule.match_mode === 'all' ? 'AND' : 'OR'}
                          </span>
                          <span className="text-dark-400 text-xs">优先级: {rule.priority}</span>
                          <span className={`text-xs px-2 py-0.5 rounded ${rule.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                            {rule.is_active ? '启用' : '停用'}
                          </span>
                        </div>
                        <div className="text-sm text-white mb-1">
                          <span className="text-dark-400">关键词：</span>{rule.keyword}
                        </div>
                        <div className="text-sm text-dark-300">
                          <span className="text-dark-400">回复：</span>{rule.reply_text}
                        </div>
                        <div className="text-xs text-dark-500 mt-1">匹配次数: {rule.match_count}</div>
                      </div>
                      <div className="flex gap-2 shrink-0 ml-4">
                        <button onClick={() => handleToggleRule(rule)}
                          className="text-xs bg-dark-700 hover:bg-dark-600 text-white px-3 py-1.5 rounded-lg transition">
                          {rule.is_active ? '停用' : '启用'}
                        </button>
                        <button onClick={() => handleDeleteRule(rule.id)}
                          className="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-1.5 rounded-lg transition">
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* New Rule Form */}
            {showRuleForm && (
              <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                <div className="bg-dark-800 border border-dark-700 rounded-2xl p-6 w-full max-w-lg">
                  <h3 className="text-lg font-bold text-white mb-4">新建自动回复规则</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm text-dark-300 block mb-1">关键词（逗号分隔多个）</label>
                      <input value={ruleForm.keyword} onChange={e => setRuleForm({...ruleForm, keyword: e.target.value})}
                        className="w-full bg-dark-900 border border-dark-600 rounded-lg px-4 py-2.5 text-white text-sm placeholder-dark-500 focus:outline-none focus:border-primary"
                        placeholder="你好,hello" />
                    </div>
                    <div>
                      <label className="text-sm text-dark-300 block mb-1">回复内容</label>
                      <textarea value={ruleForm.reply_text} onChange={e => setRuleForm({...ruleForm, reply_text: e.target.value})}
                        className="w-full bg-dark-900 border border-dark-600 rounded-lg px-4 py-2.5 text-white text-sm placeholder-dark-500 focus:outline-none focus:border-primary h-24 resize-none"
                        placeholder="支持变量: {name} {keyword} {time} {date} {weekday} {input} {random:A|B|C}" />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-sm text-dark-300 block mb-1">优先级</label>
                        <input type="number" value={ruleForm.priority} onChange={e => setRuleForm({...ruleForm, priority: parseInt(e.target.value) || 0})}
                          className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary" />
                      </div>
                      <div>
                        <label className="text-sm text-dark-300 block mb-1">匹配模式</label>
                        <select value={ruleForm.match_mode} onChange={e => setRuleForm({...ruleForm, match_mode: e.target.value})}
                          className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary">
                          <option value="any">任一匹配</option>
                          <option value="all">全部匹配</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-sm text-dark-300 block mb-1">匹配类型</label>
                        <select value={ruleForm.match_type} onChange={e => setRuleForm({...ruleForm, match_type: e.target.value})}
                          className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary">
                          <option value="contains">包含</option>
                          <option value="regex">正则</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3 mt-5">
                    <button onClick={handleCreateRule} className="flex-1 bg-primary hover:bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium transition">创建</button>
                    <button onClick={() => setShowRuleForm(false)} className="flex-1 bg-dark-700 hover:bg-dark-600 text-white py-2.5 rounded-lg text-sm transition">取消</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
