import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../services/api'

// ─── Types ───
interface Dialog { id: string; name: string; lastMessage: string; lastMessageDate: number; lastSenderName: string; unreadCount: number; isGroup: boolean; isChannel: boolean }
interface Message { id: number; chatId: string; text: string; date: number; isOut: boolean; senderId: string; senderName: string; type?: string; mediaUrl?: string; fileName?: string; isRead?: boolean }
interface BotRule { id: number; keyword: string; match_type: string; reply_text: string; is_active: number; match_count: number; total_matches?: number; priority: number; match_mode: string; delay_min: number; delay_max: number; cooldown: number; scope: string }
interface BotLog { id: number; rule_id: number; from_user_id: string; from_user_name: string; keyword: string; reply_text: string; chat_type: string; rule_keyword?: string; created_at: string }
type Tab = 'chat' | 'bot'
type BotSubTab = 'rules' | 'logs' | 'test'

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
function formatLogTime(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T') + 'Z')
  if (isNaN(d.getTime())) return dateStr
  const now = new Date()
  const diffH = (now.getTime() - d.getTime()) / 3600000
  if (diffH < 1) return `${Math.max(1, Math.floor(diffH * 60))}分钟前`
  if (diffH < 24) return `${Math.floor(diffH)}小时前`
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

// ─── Match type labels ───
const MATCH_TYPE_LABELS: Record<string, string> = { contains: '包含', regex: '正则', exact: '精确', starts: '开头', ends: '结尾' }
const SCOPE_LABELS: Record<string, string> = { all: '全部', private: '私聊', group: '群聊' }

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

const truncateText = (text: string, maxLen: number) => {
  if (!text) return ''
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text
}

const DEFAULT_RULE_FORM = { keyword: '', reply_text: '', priority: 0, match_mode: 'any', match_type: 'contains', delay_min: 0, delay_max: 1, cooldown: 0, scope: 'all' }

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
  const [botSubTab, setBotSubTab] = useState<BotSubTab>('rules')
  const [rules, setRules] = useState<BotRule[]>([])
  const [botEnabled, setBotEnabled] = useState(true)
  const [showRuleForm, setShowRuleForm] = useState(false)
  const [editingRule, setEditingRule] = useState<BotRule | null>(null)
  const [ruleForm, setRuleForm] = useState({ ...DEFAULT_RULE_FORM })
  const [logs, setLogs] = useState<BotLog[]>([])
  const [testText, setTestText] = useState('')
  const [testResult, setTestResult] = useState<{ matched: any[]; count: number } | null>(null)
  const [logsLoading, setLogsLoading] = useState(false)

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
    if (selectedChat) { loadMessages(); markRead(selectedChat) }
  }, [selectedChat])
  useEffect(() => { if (tab === 'bot') { loadRules(); loadBotStatus() } }, [tab])
  useEffect(() => { if (botSubTab === 'logs') loadLogs() }, [botSubTab])
  useEffect(() => {
    if (messages.length > 0) requestAnimationFrame(() => msgEndRef.current?.scrollIntoView({ behavior: 'auto' }))
  }, [messages.length])

  const markRead = async (chatId: string) => {
    try {
      await api.markAsRead(accountId, chatId)
      setDialogs(prev => prev.map(d => d.id === chatId ? { ...d, unreadCount: 0 } : d))
    } catch (e) { /* ignore */ }
  }
  const loadAccount = async () => { const accs = await api.getAccounts(); setAccount(accs.find((a: any) => a.id === accountId)) }
  const loadDialogs = async () => { setLoading(true); try { const data = await api.getDialogs(accountId); setDialogs(data) } catch (e) { console.error(e) }; setLoading(false) }
  const loadMessages = async () => { setMsgLoading(true); setLoadError(false); try { const data = await api.getMessages(accountId, selectedChat!); setMessages(data.reverse()) } catch (e) { console.error(e); setLoadError(true) }; setMsgLoading(false) }
  const loadRules = async () => { const data = await api.getRules(accountId); setRules(data) }
  const loadBotStatus = async () => { try { const data = await api.getBotStatus(accountId); setBotEnabled(data.enabled) } catch (e) { /* default true */ } }
  const loadLogs = async () => { setLogsLoading(true); try { const data = await api.getBotLogs(accountId); setLogs(data) } catch (e) { console.error(e) }; setLogsLoading(false) }

  const handleSend = async () => {
    if (!newMsg.trim() || !selectedChat) return
    await api.sendMessage(accountId, selectedChat, newMsg)
    setNewMsg(''); loadMessages()
  }
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }
  const handleDeleteMessage = async (msgId: number) => { console.log('Delete message', msgId) }
  const handleSelectChat = (chatId: string) => { setSelectedChat(chatId); setMessages([]); setLoadError(false); setShowMobileChat(true); setDialogs(prev => prev.map(d => d.id === chatId ? { ...d, unreadCount: 0 } : d)) }
  const handleBack = () => { setShowMobileChat(false); setSelectedChat(null) }

  // Bot handlers
  const handleToggleBot = async () => {
    const newVal = !botEnabled
    await api.setBotStatus(accountId, newVal)
    setBotEnabled(newVal)
  }
  const handleCreateRule = async () => {
    await api.createRule(accountId, ruleForm)
    setShowRuleForm(false); setRuleForm({ ...DEFAULT_RULE_FORM }); loadRules()
  }
  const handleUpdateRule = async () => {
    if (!editingRule) return
    await api.updateRule(editingRule.id, { ...ruleForm, is_active: editingRule.is_active })
    setEditingRule(null); setShowRuleForm(false); setRuleForm({ ...DEFAULT_RULE_FORM }); loadRules()
  }
  const handleDeleteRule = async (ruleId: number) => { if (!confirm('删除此规则？关联的日志也会清除。')) return; await api.deleteRule(ruleId); loadRules(); if (botSubTab === 'logs') loadLogs() }
  const handleToggleRule = async (rule: BotRule) => { await api.updateRule(rule.id, { ...rule, is_active: rule.is_active ? 0 : 1 }); loadRules() }
  const handleEditRule = (rule: BotRule) => {
    setEditingRule(rule)
    setRuleForm({ keyword: rule.keyword, reply_text: rule.reply_text, priority: rule.priority, match_mode: rule.match_mode, match_type: rule.match_type, delay_min: rule.delay_min || 0, delay_max: rule.delay_max || 1, cooldown: rule.cooldown || 0, scope: rule.scope || 'all' })
    setShowRuleForm(true)
  }
  const handleClearLogs = async () => { if (!confirm('确定清空所有自动回复日志？')) return; await api.clearBotLogs(accountId); loadLogs(); loadRules() }
  const handleTestMatch = async () => {
    if (!testText.trim()) return
    const result = await api.testBotMatch(accountId, testText)
    setTestResult(result)
  }

  const filteredDialogs = dialogs.filter(d => d.name.toLowerCase().includes(search.toLowerCase()))
  const selectedDialog = dialogs.find(d => d.id === selectedChat)
  const groupedMessages: { date: string; messages: Message[] }[] = []
  let currentDate = ''
  for (const msg of messages) {
    const dateStr = formatDateSeparator(msg.date)
    if (dateStr !== currentDate) { currentDate = dateStr; groupedMessages.push({ date: dateStr, messages: [] }) }
    groupedMessages[groupedMessages.length - 1].messages.push(msg)
  }

  // ─── Rule Form Modal ───
  const RuleFormModal = () => showRuleForm ? (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-gray-800 mb-4">{editingRule ? '编辑规则' : '新建自动回复规则'}</h3>
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
                <option value="contains">包含</option><option value="exact">精确</option><option value="starts">开头</option><option value="ends">结尾</option><option value="regex">正则</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm text-gray-600 block mb-1">最小延迟(秒)</label>
              <input type="number" value={ruleForm.delay_min} onChange={e => setRuleForm({ ...ruleForm, delay_min: parseInt(e.target.value) || 0 })}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-800 text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">最大延迟(秒)</label>
              <input type="number" value={ruleForm.delay_max} onChange={e => setRuleForm({ ...ruleForm, delay_max: parseInt(e.target.value) || 1 })}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-800 text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">冷却(秒)</label>
              <input type="number" value={ruleForm.cooldown} onChange={e => setRuleForm({ ...ruleForm, cooldown: parseInt(e.target.value) || 0 })}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-800 text-sm focus:outline-none focus:border-primary" />
            </div>
          </div>
          <div>
            <label className="text-sm text-gray-600 block mb-1">适用范围</label>
            <select value={ruleForm.scope} onChange={e => setRuleForm({ ...ruleForm, scope: e.target.value })}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-800 text-sm focus:outline-none focus:border-primary">
              <option value="all">全部会话</option><option value="private">仅私聊</option><option value="group">仅群聊</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={editingRule ? handleUpdateRule : handleCreateRule} className="flex-1 bg-primary hover:bg-primary-dark text-white py-2.5 rounded-lg text-sm font-medium transition">{editingRule ? '保存' : '创建'}</button>
          <button onClick={() => { setShowRuleForm(false); setEditingRule(null); setRuleForm({ ...DEFAULT_RULE_FORM }) }} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-lg text-sm transition">取消</button>
        </div>
      </div>
    </div>
  ) : null

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* ─── Header ─── */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={() => navigate('/')} className="text-gray-500 hover:text-gray-700 p-1">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-gray-800 truncate">{account?.phone || `账号 #${accountId}`}</h1>
          {account?.first_name && <p className="text-xs text-gray-500 truncate">{account.first_name} {account.username ? `@${account.username}` : ''}</p>}
        </div>
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          <button onClick={() => setTab('chat')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${tab === 'chat' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>聊天</button>
          <button onClick={() => setTab('bot')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${tab === 'bot' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Bot</button>
        </div>
      </div>

      {/* ─── Content ─── */}
      {tab === 'chat' ? (
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <div className={`${isDesktop ? 'w-80 border-r border-gray-200' : showMobileChat ? 'hidden' : 'w-full'} flex flex-col bg-white`}>
            <div className="p-3 border-b border-gray-100">
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索会话..."
                className="w-full bg-gray-100 rounded-lg px-4 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-4 space-y-3">{[1,2,3,4,5].map(i => (<div key={i} className="flex items-center gap-3 animate-pulse"><div className="w-12 h-12 rounded-full bg-gray-200" /><div className="flex-1 space-y-2"><div className="h-3 bg-gray-200 rounded w-3/4" /><div className="h-2 bg-gray-200 rounded w-1/2" /></div></div>))}</div>
              ) : filteredDialogs.length === 0 ? (
                <div className="text-center py-16 text-gray-400"><p className="text-sm">暂无会话</p></div>
              ) : (
                filteredDialogs.map(d => (
                  <div key={d.id} onClick={() => handleSelectChat(d.id)} className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition ${selectedChat === d.id ? 'bg-primary/5' : ''}`}>
                    <Avatar name={d.name} size={48} />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-800 truncate">{d.name}</span>
                        <span className="text-[10px] text-gray-400 shrink-0 ml-2">{formatTime(d.lastMessageDate)}</span>
                      </div>
                      <div className="flex justify-between items-center mt-0.5">
                        <p className="text-xs text-gray-500 truncate">{d.lastSenderName && <span className="text-gray-400">{d.lastSenderName}: </span>}{truncateText(d.lastMessage, 40)}</p>
                        {d.unreadCount > 0 && <span className="bg-primary text-white text-[10px] min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1 shrink-0 ml-2">{d.unreadCount > 99 ? '99+' : d.unreadCount}</span>}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Chat Window */}
          <div className={`${isDesktop ? 'flex-1' : showMobileChat ? 'w-full' : 'hidden'} flex flex-col`}>
            {!selectedChat ? (
              <div className="flex-1 flex items-center justify-center bg-tg-chat-bg chat-bg"><div className="text-center text-gray-400"><div className="text-5xl mb-3">💬</div><p className="text-sm">选择一个会话开始聊天</p></div></div>
            ) : (
              <>
                <div className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center gap-3 shrink-0">
                  {!isDesktop && <button onClick={handleBack} className="text-gray-500 hover:text-gray-700 p-1"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg></button>}
                  <Avatar name={selectedDialog?.name || ''} size={36} />
                  <div className="flex-1 min-w-0"><p className="text-sm font-medium text-gray-800 truncate">{selectedDialog?.name}</p>{(selectedDialog?.isGroup || selectedDialog?.isChannel) && <p className="text-[10px] text-gray-400">{selectedDialog?.isChannel ? '频道' : '群组'}</p>}</div>
                </div>
                <div ref={msgContainerRef} className="flex-1 overflow-y-auto px-4 py-3 bg-tg-chat-bg chat-bg">
                  {msgLoading ? (<div className="flex items-center justify-center h-full"><div className="text-sm text-gray-400">加载中...</div></div>) : loadError ? (<div className="flex flex-col items-center justify-center h-full text-center"><div className="text-3xl mb-2">⚠️</div><p className="text-sm text-red-500 mb-3">加载消息失败</p><button onClick={loadMessages} className="text-xs text-primary hover:underline">重试</button></div>) : groupedMessages.length === 0 ? (<div className="flex items-center justify-center h-full"><p className="text-sm text-gray-400">暂无消息</p></div>) : (
                    groupedMessages.map((group, gi) => (
                      <div key={gi}>
                        <div className="flex justify-center my-3"><span className="bg-white/80 text-gray-500 text-[10px] px-2 py-0.5 rounded-full shadow-sm">{group.date}</span></div>
                        {group.messages.map(msg => (<MessageBubble key={msg.id} message={msg} chatType={selectedDialog?.isGroup ? 'group' : 'private'} showSender={!!selectedDialog?.isGroup} onDelete={handleDeleteMessage} />))}
                      </div>
                    ))
                  )}
                  <div ref={msgEndRef} />
                </div>
                <div className="bg-white border-t border-gray-200 px-4 py-2 shrink-0">
                  <div className="flex items-end gap-2">
                    <textarea ref={fileInputRef as any} value={newMsg} onChange={e => setNewMsg(e.target.value)} onKeyDown={handleKeyDown}
                      placeholder="输入消息..." rows={1} className="flex-1 resize-none border-none outline-none text-sm text-gray-900 py-2 max-h-32 overflow-y-auto" style={{ minHeight: '24px' }} />
                    <button onClick={handleSend} disabled={!newMsg.trim()} className="text-primary hover:text-primary-dark p-2 shrink-0 disabled:opacity-30 transition-opacity">
                      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        /* ─── Bot Tab ─── */
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto p-4 sm:p-6">
            {/* Bot Toggle + Sub-tabs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-gray-800">Bot 自动回复</h2>
                <button onClick={handleToggleBot} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${botEnabled ? 'bg-primary' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${botEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
                <span className={`text-xs font-medium ${botEnabled ? 'text-green-600' : 'text-gray-400'}`}>{botEnabled ? '运行中' : '已停止'}</span>
              </div>
              <div className="flex bg-gray-100 rounded-lg p-0.5 self-start">
                {(['rules', 'logs', 'test'] as BotSubTab[]).map(st => (
                  <button key={st} onClick={() => setBotSubTab(st)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${botSubTab === st ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    {st === 'rules' ? `规则 (${rules.length})` : st === 'logs' ? '日志' : '测试'}
                  </button>
                ))}
              </div>
            </div>

            {/* ─── Rules Sub-tab ─── */}
            {botSubTab === 'rules' && (
              <>
                <div className="flex justify-between items-center mb-4">
                  <p className="text-sm text-gray-500">共 {rules.length} 条规则</p>
                  <button onClick={() => { setEditingRule(null); setRuleForm({ ...DEFAULT_RULE_FORM }); setShowRuleForm(true) }}
                    className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition">+ 新建规则</button>
                </div>
                {rules.length === 0 ? (
                  <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
                    <div className="text-4xl mb-3">🤖</div><p className="text-gray-500">暂无自动回复规则</p>
                    <p className="text-xs text-gray-400 mt-1">点击"新建规则"创建第一条</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {rules.map(rule => (
                      <div key={rule.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5 mb-2">
                              <span className="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded">{MATCH_TYPE_LABELS[rule.match_type] || rule.match_type}</span>
                              <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded">{rule.match_mode === 'all' ? 'AND' : 'OR'}</span>
                              <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded">{SCOPE_LABELS[rule.scope] || '全部'}</span>
                              <span className="text-gray-500 text-xs">优先级: {rule.priority}</span>
                              <span className={`text-xs px-2 py-0.5 rounded ${rule.is_active ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>{rule.is_active ? '启用' : '停用'}</span>
                            </div>
                            <div className="text-sm text-gray-800 mb-1"><span className="text-gray-500">关键词：</span>{rule.keyword}</div>
                            <div className="text-sm text-gray-600 mb-1"><span className="text-gray-500">回复：</span>{truncateText(rule.reply_text, 100)}</div>
                            <div className="flex flex-wrap gap-3 text-xs text-gray-400 mt-1">
                              <span>匹配: {rule.total_matches ?? rule.match_count}次</span>
                              {rule.delay_min > 0 && <span>延迟: {rule.delay_min}-{rule.delay_max}s</span>}
                              {rule.cooldown > 0 && <span>冷却: {rule.cooldown}s</span>}
                            </div>
                          </div>
                          <div className="flex gap-1.5 shrink-0">
                            <button onClick={() => handleEditRule(rule)} className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 px-3 py-1.5 rounded-lg transition">编辑</button>
                            <button onClick={() => handleToggleRule(rule)} className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg transition">{rule.is_active ? '停用' : '启用'}</button>
                            <button onClick={() => handleDeleteRule(rule.id)} className="text-xs bg-red-50 hover:bg-red-100 text-red-500 px-3 py-1.5 rounded-lg transition">删除</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ─── Logs Sub-tab ─── */}
            {botSubTab === 'logs' && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <p className="text-sm text-gray-500">{logs.length} 条记录</p>
                  <button onClick={handleClearLogs} disabled={logs.length === 0}
                    className="text-xs bg-red-50 hover:bg-red-100 text-red-500 px-3 py-1.5 rounded-lg transition disabled:opacity-40">清空日志</button>
                </div>
                {logsLoading ? (
                  <div className="text-center py-12 text-gray-400 text-sm">加载中...</div>
                ) : logs.length === 0 ? (
                  <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
                    <div className="text-4xl mb-3">📋</div><p className="text-gray-500">暂无日志</p>
                    <p className="text-xs text-gray-400 mt-1">规则触发后会自动记录在这里</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {logs.map(log => (
                      <div key={log.id} className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
                        <div className="flex justify-between items-start mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">规则#{log.rule_id}</span>
                            <span className="text-xs text-gray-400">{formatLogTime(log.created_at)}</span>
                          </div>
                        </div>
                        <div className="text-sm text-gray-700 mb-0.5">
                          <span className="text-gray-400">收到：</span>
                          <span className="text-gray-500">{log.from_user_name || log.from_user_id || '未知'}</span>
                          <span className="mx-1">→</span>
                          <span>"{log.keyword}"</span>
                        </div>
                        <div className="text-sm text-green-700">
                          <span className="text-gray-400">回复：</span>{truncateText(log.reply_text, 120)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ─── Test Sub-tab ─── */}
            {botSubTab === 'test' && (
              <div>
                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm mb-4">
                  <label className="text-sm text-gray-600 block mb-2">输入测试文本，检查哪些规则会被触发：</label>
                  <div className="flex gap-2">
                    <input value={testText} onChange={e => setTestText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleTestMatch() }}
                      className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-primary"
                      placeholder="输入一段消息文本..." />
                    <button onClick={handleTestMatch} disabled={!testText.trim()}
                      className="bg-primary hover:bg-primary-dark text-white px-5 py-2.5 rounded-lg text-sm font-medium transition disabled:opacity-40">测试</button>
                  </div>
                </div>
                {testResult && (
                  <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                    <h4 className="text-sm font-bold text-gray-800 mb-3">
                      匹配结果：{testResult.count > 0 ? <span className="text-green-600">{testResult.count} 条规则命中</span> : <span className="text-red-500">无规则命中</span>}
                    </h4>
                    {testResult.count === 0 ? (
                      <p className="text-sm text-gray-400">当前启用的规则中没有匹配此文本的</p>
                    ) : (
                      <div className="space-y-2">
                        {testResult.matched.map((m: any, i: number) => (
                          <div key={i} className="bg-green-50 border border-green-200 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded">#{i + 1}</span>
                              <span className="text-xs text-gray-500">优先级: {m.priority}</span>
                              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{MATCH_TYPE_LABELS[m.match_type] || m.match_type}</span>
                            </div>
                            <div className="text-sm text-gray-800"><span className="text-gray-500">关键词：</span>{m.keyword}</div>
                            <div className="text-sm text-gray-600"><span className="text-gray-500">将回复：</span>{m.reply_text}</div>
                          </div>
                        ))}
                        <p className="text-xs text-gray-400 mt-2">* 实际回复时只会触发优先级最高的那条规则</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <RuleFormModal />
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
            <span className="text-sm">{message.type === 'video' ? '🎥' : message.type === 'document' ? '📎' : '🎤'}</span>
            <a href={message.mediaUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">{message.fileName || message.type}</a>
          </div>
        )}
        {(message.type === 'text' || !message.type) && message.text && (
          <p className="text-sm whitespace-pre-wrap break-all">{message.text}</p>
        )}
        {message.type === 'photo' && message.text && message.text !== '📷 Photo' && (
          <p className="text-sm whitespace-pre-wrap break-all">{message.text}</p>
        )}
        {!message.text && !message.mediaUrl && (
          <p className="text-sm text-gray-400 italic">[媒体消息]</p>
        )}
        <div className="flex items-center gap-1 justify-end mt-0.5">
          <span className="text-[10px] text-gray-400">{formatMessageTime(message.date)}</span>
          {isOut && (<span className={`text-[10px] ${message.isRead ? 'text-primary' : 'text-gray-400'}`}>{message.isRead ? '✓✓' : '✓'}</span>)}
        </div>
      </div>
      {showMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div className="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[140px]" style={{ left: menuPos.x, top: menuPos.y }}>
            <button onClick={() => { navigator.clipboard.writeText(message.text || ''); setShowMenu(false) }}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              复制
            </button>
            {isOut && (
              <button onClick={() => { onDelete(message.id); setShowMenu(false) }}
                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                删除（为自己）
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
