import { useState, useEffect } from 'react'
import { api } from '../services/api'
import { useNavigate } from 'react-router-dom'

interface Account {
  id: number
  telegram_user_id: number | null
  phone: string
  first_name: string | null
  username: string | null
  client_token: string
  is_active: number
  client_port: number
  is_logged_in: number
  created_at: string
}

export default function DashboardPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [twofa, setTwofa] = useState('')
  const [phoneCodeHash, setPhoneCodeHash] = useState('')
  const [step, setStep] = useState<'phone' | 'code' | '2fa' | 'done'>('phone')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const loadAccounts = async () => {
    try {
      const data = await api.getAccounts()
      setAccounts(data)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { loadAccounts() }, [])

  const handleAddAccount = async () => {
    setError('')
    try {
      const res = await api.addAccount(phone)
      if (res.error) { setError(res.error); return }
      setPhoneCodeHash(res.phoneCodeHash)
      setStep('code')
    } catch (e: any) { setError(e.message) }
  }

  const handleVerifyCode = async () => {
    setError('')
    try {
      const res = await api.verifyCode(phone, code, phoneCodeHash)
      if (res.error === '2FA_REQUIRED') { setStep('2fa'); return }
      if (res.error) { setError(res.error); return }
      setStep('done')
      setTimeout(() => { setShowAddModal(false); resetModal(); loadAccounts() }, 1500)
    } catch (e: any) { setError(e.message) }
  }

  const handleVerify2FA = async () => {
    setError('')
    try {
      const res = await api.verify2FA(phone, twofa, phoneCodeHash)
      if (res.error) { setError(res.error); return }
      setStep('done')
      setTimeout(() => { setShowAddModal(false); resetModal(); loadAccounts() }, 1500)
    } catch (e: any) { setError(e.message) }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此账号？')) return
    await api.deleteAccount(id)
    loadAccounts()
  }

  const handleToggle = async (id: number) => {
    await api.toggleAccount(id)
    loadAccounts()
  }

  const resetModal = () => {
    setStep('phone'); setPhone(''); setCode(''); setTwofa(''); setPhoneCodeHash(''); setError('')
  }

  const handleLogout = () => {
    localStorage.removeItem('admin_token')
    window.location.href = '/admin/login'
  }

  return (
    <div className="min-h-screen bg-dark-900">
      {/* Header */}
      <header className="bg-dark-800 border-b border-dark-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📱</span>
          <h1 className="text-xl font-bold text-white">Telegram 多账号管理后台</h1>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => { resetModal(); setShowAddModal(true) }}
            className="bg-primary hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
            + 添加账号
          </button>
          <button onClick={handleLogout}
            className="text-dark-400 hover:text-white text-sm transition">
            退出登录
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto p-6">
        {loading ? (
          <div className="text-center text-dark-400 py-20">加载中...</div>
        ) : accounts.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">👋</div>
            <h2 className="text-xl text-white mb-2">还没有账号</h2>
            <p className="text-dark-400 mb-6">点击「添加账号」开始使用</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {accounts.map(acc => (
              <div key={acc.id}
                className="bg-dark-800 border border-dark-700 rounded-xl p-5 hover:border-dark-500 transition cursor-pointer"
                onClick={() => navigate(`/account/${acc.id}`)}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-xl">
                      {(acc.first_name || acc.phone || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium text-white">{acc.first_name || '未登录'}</div>
                      <div className="text-sm text-dark-400">@{acc.username || acc.phone}</div>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${acc.is_logged_in ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                    {acc.is_logged_in ? '已登录' : '未登录'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-dark-400 mb-3">
                  <span>端口: {acc.client_port}</span>
                  <span>·</span>
                  <span className={acc.is_active ? 'text-green-400' : 'text-red-400'}>
                    {acc.is_active ? '运行中' : '已停用'}
                  </span>
                </div>
                <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                  <button onClick={() => handleToggle(acc.id)}
                    className="flex-1 text-xs bg-dark-700 hover:bg-dark-600 text-white py-2 rounded-lg transition">
                    {acc.is_active ? '停用' : '启用'}
                  </button>
                  <button onClick={() => handleDelete(acc.id)}
                    className="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-2 rounded-lg transition">
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Add Account Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-800 border border-dark-700 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold text-white mb-4">
              {step === 'phone' && '添加 Telegram 账号'}
              {step === 'code' && '输入验证码'}
              {step === '2fa' && '输入两步验证密码'}
              {step === 'done' && '✅ 登录成功'}
            </h2>
            {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2 mb-3 text-red-400 text-sm">{error}</div>}
            
            {step === 'phone' && (
              <div className="space-y-3">
                <input value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="+8613800138000" className="w-full bg-dark-900 border border-dark-600 rounded-lg px-4 py-3 text-white placeholder-dark-500 focus:outline-none focus:border-primary" />
                <button onClick={handleAddAccount} className="w-full bg-primary hover:bg-blue-600 text-white py-3 rounded-lg transition">
                  发送验证码
                </button>
              </div>
            )}
            {step === 'code' && (
              <div className="space-y-3">
                <p className="text-sm text-dark-300 mb-2">验证码已发送到 {phone}</p>
                <input value={code} onChange={e => setCode(e.target.value)}
                  placeholder="输入5位验证码" className="w-full bg-dark-900 border border-dark-600 rounded-lg px-4 py-3 text-white placeholder-dark-500 focus:outline-none focus:border-primary" />
                <button onClick={handleVerifyCode} className="w-full bg-primary hover:bg-blue-600 text-white py-3 rounded-lg transition">
                  验证
                </button>
              </div>
            )}
            {step === '2fa' && (
              <div className="space-y-3">
                <p className="text-sm text-dark-300 mb-2">此账号开启了两步验证</p>
                <input type="password" value={twofa} onChange={e => setTwofa(e.target.value)}
                  placeholder="输入2FA密码" className="w-full bg-dark-900 border border-dark-600 rounded-lg px-4 py-3 text-white placeholder-dark-500 focus:outline-none focus:border-primary" />
                <button onClick={handleVerify2FA} className="w-full bg-primary hover:bg-blue-600 text-white py-3 rounded-lg transition">
                  验证
                </button>
              </div>
            )}
            {step === 'done' && <p className="text-green-400">账号已成功添加！</p>}
            
            <button onClick={() => { setShowAddModal(false); resetModal() }}
              className="w-full mt-3 text-dark-400 hover:text-white text-sm transition py-2">
              {step === 'done' ? '关闭' : '取消'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
