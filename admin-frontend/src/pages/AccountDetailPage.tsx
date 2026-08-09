import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../services/api'

// ─── Types ───
interface Dialog { id: string; name: string; lastMessage: string; lastMessageDate: number; lastSenderName: string; unreadCount: number; isGroup: boolean; isChannel: boolean }
interface Message { id: number; chatId: string; text: string; date: number; isOut: boolean; senderId: string; senderName: string; type?: string; mediaUrl?: string; fileName?: string; isRead?: boolean }
interface BotRule { id: number; keyword: string; match_type: string; reply_text: string; is_active: number; match_count: number; priority: number; match_mode: string }
type Tab = 'chat' | 'bot'

// ─── Format helpers ───
function formatTime(timestamp: number): string {
  if (!timestamp) return ''
  const date = new Date(timestamp * 1000)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  if (diffDays === 1) return '昨天'
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'short' })
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}
function formatMessageTime(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}
function formatDateSeparator(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return '今天'
  if (diffDays === 1) return '昨天'
  return date.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })
}

// ─── Color palette for avatars ───
const AVATAR_COLORS = ['#e17076', '#7bc862', '#e5a00e', '#65aadd', '#a695e7', '#ee7aae', '#6ec9cb', '#faa774']
function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

// ─── Avatar Component ───
function Avatar({ name, size = 40, color, online }: { name: string; size?: number; color?: string; online?: boolean }) {
  const initials = name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
  const bg = color || getAvatarColor(name)
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className="rounded-full flex items-center justify-center text-white font-medium" style={{ width: size, height: size, backgroundColor: bg, fontSize: size * 0.38 }}>
        {initials || '?'}
      </div>
      {online && <div className="absolute bottom-0 right-0 bg-green-500 rounded-full border-2 border-white" style={{ width: size * 0.3, height: size * 0.3 }} />}
    </div>
  )
}

// ─── Truncate ───
const truncateText = (text: string, maxLen: number) => {
  if (!text) return ''
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text
}

// ─── Main Component ───
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
  const [loadError, setLoadError] = useState(false)
  const msgEndRef = useRef<HTMLDivElement>(null)
  const msgContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')

  // Bot state
  const [rules, setRules] = useState<BotRule[]>([])
  const [showRuleForm, setShowRuleForm] = useState(false)
  const [ruleForm, setRuleForm] = useState({ keyword: '', reply_text: '', priority: 0, match_mode: 'any', match_type: 'contains' })

  // Mobile
  const [showMobileChat, setShowMobileChat] = useState(false)
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)')
    const handler = (e: MediaQueryListEvent | MediaQueryList) => setIsDesktop(e.matches)
    handler(mq); mq.addEventListener('change', handler as (e: MediaQueryListEvent) => void)
    return () => mq.removeEventListener('change', handler as (e: MediaQueryListEvent) => void)
  }, [])

  useEffect(() => { loadAccount(); loadDialogs() }, [accountId])
  useEffect(() => {
    if (selectedChat) {
      loadMessages()
      markRead(selectedChat)
    }
  }, [selectedChat])
  useEffect(() => { if (tab === 'bot') loadRules() }, [tab])
  useEffect(() => {
    if (messages.length > 0) requestAnimationFrame(() => msgEndRef.current?.scrollIntoView({ behavior: 'auto' }))
  }, [messages.length])

  const markRead = async (chatId: string) => {
    try {
      await api.markAsRead(accountId, chatId)
      setDialogs(prev => prev.map(d => d.id === chatId ? { ...d, unreadCount: 0 } : d))
    } catch (e) { /* ignore */ }
  }

  const loadAccount = async () => {
    const accs = await api.getAccounts()
    setAccount(accs.find((a: any) => a.id === accountId))
  }

  const loadDialogs = async () => {
    setLoading(true)
    try { const data = await api.getDialogs(accountId); setDialogs(data) }
    catch (e) { console.error(e) }
    setLoading(false)
  }

  const loadMessages = async () => {
    setMsgLoading(true); setLoadError(false)
    try { const data = await api.getMessages(accountId, selectedChat!); setMessages(data.reverse()) }
    catch (e) { console.error(e); setLoadError(true) }
    setMsgLoading(false)
  }

  const loadRules = async () => { const data = await api.getRules(accountId); setRules(data) }

  const handleSend = async () => {
    if (!newMsg.trim() || !selectedChat) return
    await api.sendMessage(accountId, selectedChat, newMsg)
    setNewMsg('')
    loadMessages()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const handleDeleteMessage = async (msgId: number) => {
    // placeholder – multi-account version doesn't have delete endpoint yet
    console.log('Delete message', msgId)
  }

  const handleSelectChat = (chatId: string) => {
    setSelectedChat(chatId)
    setMessages([])
    setLoadError(false)
    setShowMobileChat(true)
    // Clear unread immediately
    setDialogs(prev => prev.map(d => d.id === chatId ? { ...d, unreadCount: 0 } : d))
  }

  const handleBack = () => { setShowMobileChat(false); setSelectedChat(null) }

  const handleCreateRule = async () => {
    await api.createRule(accountId, ruleForm)
    setShowRuleForm(false)
    setRuleForm({ keyword: '', reply_text: '', priority: 0, match_mode: 'any', match_type: 'contains' })
    loadRules()
  }

  const handleDeleteRule = async (ruleId: number) => {
    if (!confirm('删除此规则?')) return
    await api.deleteRule(ruleId); loadRules()
  }

  const handleToggleRule = async (rule: BotRule) => {
    await api.updateRule(rule.id, { ...rule, is_active: rule.is_active ? 0 : 1 })
    loadRules()
  }

  const filteredDialogs = dialogs.filter(d => d.name.toLowerCase().includes(search.toLowerCase()))
  const selectedDialog = dialogs.find(d => d.id === selectedChat)
  const isGroupChat = selectedDialog?.isGroup || selectedDialog?.isChannel

  // Group messages by date
  const groupedMessages: { date: string; messages: Message[] }[] = []
  let currentDate = ''
  for (const msg of messages) {
    const dateStr = formatDateSeparator(msg.date)
    if (dateStr !== currentDate) { currentDate = dateStr; groupedMessages.push({ date: dateStr, messages: [msg] }) }
    else { groupedMessages[groupedMessages.length - 1].messages.push(msg) }
  }

  return (
    <div className="h-[100dvh] bg-tg-bg flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-gray-500 hover:text-gray-800 transition text-sm flex items-center gap-1">
            <span>←</span> 返回
          </button>
          <Avatar name={account?.first_name || account?.phone || '?'} size={32} />
          <div>
            <div className="font-medium text-gray-900 text-sm">{account?.first_name || account?.phone || '加载中'}</div>
            <div className="text-xs text-gray-500">📱 {account?.phone || ''}</div>
          </div>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button onClick={() => setTab('chat')} className={`px-3 py-1.5 rounded-md text-sm transition ${tab === 'chat' ? 'bg-white text-primary shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`}>💬 聊天</button>
          <button onClick={() => setTab('bot')} className={`px-3 py-1.5 rounded-md text-sm transition ${tab === 'bot' ? 'bg-white text-primary shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`}>🤖 Bot</button>
        </div>
      </header>

      {tab === 'chat' ? (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* ─── Sidebar ─── */}
          <div className="w-[360px] shrink-0 h-full bg-white border-r border-gray-200 flex flex-col" style={{ display: (showMobileChat && !isDesktop) ? 'none' : 'flex' }}>
            {/* Search */}
            <div className="p-3 border-b border-gray-100">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input type="text" placeholder="搜索聊天..." value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-white transition-all" />
              </div>
            </div>
            {/* Dialog list */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-3 space-y-3">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 p-2">
                      <div className="skeleton w-12 h-12 rounded-full shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="skeleton h-4 w-3/4 rounded" />
                        <div className="skeleton h-3 w-1/2 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredDialogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                  <svg className="w-12 h-12 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <p className="text-sm">暂无聊天</p>
                </div>
              ) : (
                filteredDialogs.map(d => (
                  <div key={d.id}
                    onClick={() => handleSelectChat(d.id)}
                    className={`relative flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${selectedChat === d.id ? 'bg-primary/10' : 'hover:bg-gray-50'}`}>
                    <Avatar name={d.name} size={48} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-900 text-sm truncate">
                          {d.isChannel && <span className="text-gray-400 mr-1">📣</span>}
                          {d.isGroup && !d.isChannel && <span className="text-gray-400 mr-1">👥</span>}
                          {d.name}
                        </span>
                        <span className="text-xs text-gray-400 shrink-0 ml-2">{formatTime(d.lastMessageDate)}</span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-sm text-gray-500 truncate pr-2">
                          {d.lastSenderName ? <span className="text-primary">{d.lastSenderName}: </span> : ''}{d.lastMessage || '暂无消息'}
                        </p>
                        {d.unreadCount > 0 && (
                          <span className="bg-primary text-white text-xs rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 font-medium">
                            {d.unreadCount > 99 ? '99+' : d.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ─── Chat Window ─── */}
          <div className="flex-1 min-w-0 h-full flex flex-col" style={{ display: (!showMobileChat && !isDesktop) ? 'none' : 'flex' }}>
            {!selectedChat ? (
              <div className="flex-1 flex items-center justify-center chat-bg">
                <div className="text-center text-gray-500">
                  <svg className="w-20 h-20 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <p className="text-lg font-medium">选择一个聊天开始消息</p>
                </div>
              </div>
            ) : (
              <>
                {/* Chat header */}
                <div className="h-14 bg-white border-b border-gray-200 flex items-center px-4 shrink-0">
                  {isDesktop ? null : (
                    <button onClick={handleBack} className="mr-2 text-gray-500 hover:text-gray-700">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                  )}
                  <Avatar name={selectedDialog?.name || '?'} size={36} />
                  <div className="ml-3">
                    <h2 className="font-medium text-gray-900 text-sm">{selectedDialog?.name || selectedChat}</h2>
                    <p className="text-xs text-gray-500">
                      {isGroupChat ? (selectedDialog?.isChannel ? '频道' : '群组') : '私聊'}
                    </p>
                  </div>
                </div>

                {/* Messages area */}
                <div ref={msgContainerRef} className="flex-1 overflow-y-auto chat-bg px-4 py-2" onScroll={() => {}}>
                  {loadError ? (
                    <div className="flex flex-col items-center justify-center py-12">
                      <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-3">
                        <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                      </div>
                      <p className="text-gray-500 text-sm mb-3">消息加载失败</p>
                      <button onClick={loadMessages} className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-full text-sm hover:bg-primary-dark transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        重新加载
                      </button>
                    </div>
                  ) : msgLoading && messages.length === 0 ? (
                    <div className="space-y-4 py-4">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                          <div className={`skeleton rounded-xl ${i % 2 === 0 ? 'w-48' : 'w-36'} h-10`} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      {groupedMessages.map(group => (
                        <div key={group.date}>
                          <div className="flex justify-center my-3">
                            <span className="bg-black/10 text-white text-xs px-3 py-1 rounded-full backdrop-blur-sm">{group.date}</span>
                          </div>
                          {group.messages.map((msg, idx, arr) => {
                            const showSender = !msg.isOut && isGroupChat && msg.senderName && (idx === 0 || arr[idx - 1].senderId !== msg.senderId)
                            return <MessageBubble key={msg.id} message={msg} chatType={isGroupChat ? 'supergroup' : 'private'} showSender={!!showSender} onDelete={handleDeleteMessage} />
                          })}
                        </div>
                      ))}
                      <div ref={msgEndRef} />
                    </>
                  )}
                </div>

                {/* Input area */}
                <div className="bg-white border-t border-gray-200 px-4 py-3 shrink-0">
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.rar,.txt" />
                  <div className="flex items-end gap-2">
                    <button onClick={() => fileInputRef.current?.click()} className="text-gray-400 hover:text-gray-600 p-2 shrink-0" title="发送文件">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                    </button>
                    <textarea value={newMsg} onChange={e => setNewMsg(e.target.value)} onKeyDown={handleKeyDown}
                      placeholder="输入消息..." rows={1}
                      className="flex-1 resize-none border-none outline-none text-sm py-2 max-h-32 overflow-y-auto"
                      style={{ minHeight: '24px' }} />
                    <button onClick={handleSend} disabled={!newMsg.trim()}
                      className="text-primary hover:text-primary-dark p-2 shrink-0 disabled:opacity-30 transition-opacity">
                      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        /* ─── Bot Tab ─── */
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-800">Bot 自动回复规则</h2>
              <button onClick={() => setShowRuleForm(true)} className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition">+ 新建规则</button>
            </div>
            {rules.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
                <div className="text-4xl mb-3">🤖</div><p className="text-gray-500">暂无自动回复规则</p>
              </div>
            ) : (
              <div className="space-y-3">
                {rules.map(rule => (
                  <div key={rule.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded">{rule.match_type === 'regex' ? '正则' : '关键词'}</span>
                          <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded">{rule.match_mode === 'all' ? 'AND' : 'OR'}</span>
                          <span className="text-gray-500 text-xs">优先级: {rule.priority}</span>
                          <span className={`text-xs px-2 py-0.5 rounded ${rule.is_active ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>{rule.is_active ? '启用' : '停用'}</span>
                        </div>
                        <div className="text-sm text-gray-800 mb-1"><span className="text-gray-500">关键词：</span>{rule.keyword}</div>
                        <div className="text-sm text-gray-600"><span className="text-gray-500">回复：</span>{rule.reply_text}</div>
                        <div className="text-xs text-gray-400 mt-1">匹配次数: {rule.match_count}</div>
                      </div>
                      <div className="flex gap-2 shrink-0 ml-4">
                        <button onClick={() => handleToggleRule(rule)} className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg transition">{rule.is_active ? '停用' : '启用'}</button>
                        <button onClick={() => handleDeleteRule(rule.id)} className="text-xs bg-red-50 hover:bg-red-100 text-red-500 px-3 py-1.5 rounded-lg transition">删除</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {showRuleForm && (
              <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg">
                  <h3 className="text-lg font-bold text-gray-800 mb-4">新建自动回复规则</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm text-gray-600 block mb-1">关键词（逗号分隔多个）</label>
                      <input value={ruleForm.keyword} onChange={e => setRuleForm({ ...ruleForm, keyword: e.target.value })}
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-gray-800 text-sm placeholder-gray-400 focus:outline-none focus:border-primary" placeholder="你好,hello" />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 block mb-1">回复内容</label>
                      <textarea value={ruleForm.reply_text} onChange={e => setRuleForm({ ...ruleForm, reply_text: e.target.value })}
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-gray-800 text-sm placeholder-gray-400 focus:outline-none focus:border-primary h-24 resize-none"
                        placeholder="支持变量: {name} {keyword} {time} {date} {weekday} {input} {random:A|B|C}" />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-sm text-gray-600 block mb-1">优先级</label>
                        <input type="number" value={ruleForm.priority} onChange={e => setRuleForm({ ...ruleForm, priority: parseInt(e.target.value) || 0 })}
                          className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-800 text-sm focus:outline-none focus:border-primary" />
                      </div>
                      <div>
                        <label className="text-sm text-gray-600 block mb-1">匹配模式</label>
                        <select value={ruleForm.match_mode} onChange={e => setRuleForm({ ...ruleForm, match_mode: e.target.value })}
                          className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-800 text-sm focus:outline-none focus:border-primary">
                          <option value="any">任一匹配</option><option value="all">全部匹配</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-sm text-gray-600 block mb-1">匹配类型</label>
                        <select value={ruleForm.match_type} onChange={e => setRuleForm({ ...ruleForm, match_type: e.target.value })}
                          className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-800 text-sm focus:outline-none focus:border-primary">
                          <option value="contains">包含</option><option value="regex">正则</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3 mt-5">
                    <button onClick={handleCreateRule} className="flex-1 bg-primary hover:bg-primary-dark text-white py-2.5 rounded-lg text-sm font-medium transition">创建</button>
                    <button onClick={() => setShowRuleForm(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-lg text-sm transition">取消</button>
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

// ─── Message Bubble ───
function MessageBubble({ message, chatType, showSender, onDelete }: { message: Message; chatType: string; showSender: boolean; onDelete: (id: number) => void }) {
  const [showMenu, setShowMenu] = useState(false)
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })
  const isOut = message.isOut

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    const x = Math.min(e.clientX, window.innerWidth - 200)
    const y = Math.min(e.clientY, window.innerHeight - 200)
    setMenuPos({ x, y }); setShowMenu(true)
  }

  return (
    <div className={`flex mb-1 ${isOut ? 'justify-end' : 'justify-start'} group`} onContextMenu={handleContextMenu}>
      <div className={`relative w-fit min-w-0 max-w-[65%] rounded-xl px-3 py-1.5 shadow-sm ${isOut ? 'bg-tg-bubble-out text-gray-900' : 'bg-tg-bubble-in text-gray-900'}`}>
        {showSender && message.senderName && (
          <p className="text-xs font-medium text-primary mb-0.5">{message.senderName}</p>
        )}

        {message.type === 'photo' && message.mediaUrl && (
          <div className="mb-1">
            <img src={message.mediaUrl} alt="照片" className="max-w-full rounded-lg cursor-pointer hover:opacity-90"
              style={{ maxHeight: '300px', objectFit: 'cover' }} loading="lazy"
              onClick={() => window.open(message.mediaUrl, '_blank')}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          </div>
        )}

        {message.type === 'sticker' && message.mediaUrl && (
          <img src={message.mediaUrl} alt="贴纸" className="w-32 h-32 object-contain" loading="lazy" />
        )}

        {['video', 'document', 'voice'].includes(message.type || '') && (
          <div className="flex items-center gap-1 mb-0.5">
            <span className="text-sm">
              {message.type === 'video' && '🎥'}
              {message.type === 'document' && '📎'}
              {message.type === 'voice' && '🎤'}
            </span>
            <a href={message.mediaUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
              {message.fileName || message.type}
            </a>
          </div>
        )}

        {message.type === 'text' && message.text && (
          <p className="text-sm whitespace-pre-wrap break-all">{message.text}</p>
        )}

        {!message.type && message.text && (
          <p className="text-sm whitespace-pre-wrap break-all">{message.text}</p>
        )}

        {!message.text && !message.mediaUrl && (
          <p className="text-sm text-gray-400 italic">[媒体消息]</p>
        )}

        {message.type === 'photo' && message.text && message.text !== '📷 Photo' && (
          <p className="text-sm whitespace-pre-wrap break-all">{message.text}</p>
        )}

        <div className="flex items-center gap-1 justify-end mt-0.5">
          <span className="text-[10px] text-gray-400">{formatMessageTime(message.date)}</span>
          {isOut && (
            <span className={`text-[10px] ${message.isRead ? 'text-primary' : 'text-gray-400'}`}>
              {message.isRead ? '✓✓' : '✓'}
            </span>
          )}
        </div>
      </div>

      {showMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div className="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[140px]" style={{ left: menuPos.x, top: menuPos.y }}>
            <button onClick={() => { navigator.clipboard.writeText(message.text || ''); setShowMenu(false) }}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              复制
            </button>
            {isOut && (
              <button onClick={() => { onDelete(message.id); setShowMenu(false) }}
                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                删除（为自己）
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
