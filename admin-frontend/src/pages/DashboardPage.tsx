import { useState, useEffect, useRef } from 'react'
import { api } from '../services/api'
import { useNavigate } from 'react-router-dom'

interface Account {
  id: number; telegram_user_id: number | null; phone: string
  first_name: string | null; username: string | null; client_token: string
  is_active: number; client_port: number; is_logged_in: number; created_at: string
}

export default function DashboardPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [loginMode, setLoginMode] = useState<'phone' | 'qr'>('qr')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [twofa, setTwofa] = useState('')
  const [phoneCodeHash, setPhoneCodeHash] = useState('')
  const [step, setStep] = useState<'phone' | 'code' | '2fa' | 'done' | 'qr'>('phone')
  const [error, setError] = useState('')
  const [qrSvg, setQrSvg] = useState('')
  const [qrSessionId, setQrSessionId] = useState('')
  const [qrStatus, setQrStatus] = useState('')
  const qrTimerRef = useRef<any>(null)
  const navigate = useNavigate()

  const loadAccounts = async () => {
    try { const data = await api.getAccounts(); setAccounts(data) }
    catch (e) { console.error(e) }
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

  const startQRLogin = async () => {
    setError('')
    setQrStatus('loading')
    try {
      const res = await api.startQRLogin()
      if (res.error) { setError(res.error); setQrStatus(''); return }
      setQrSvg(res.qrSvg)
      setQrSessionId(res.sessionId)
      setQrStatus('waiting')
      if (qrTimerRef.current) clearInterval(qrTimerRef.current)
      qrTimerRef.current = setInterval(async () => {
        try {
          const status = await api.checkQRStatus(res.sessionId)
          if (status.status === 'success') {
            clearInterval(qrTimerRef.current)
            setQrStatus('success')
            setTimeout(() => { setShowAddModal(false); resetModal(); loadAccounts() }, 1500)
          } else if (status.status === 'expired') {
            clearInterval(qrTimerRef.current)
            setQrStatus('expired')
          }
        } catch (e) { /* ignore */ }
      }, 3000)
    } catch (e: any) { setError(e.message); setQrStatus('') }
  }

  const resetModal = () => {
    setStep('phone'); setPhone(''); setCode(''); setTwofa(''); setPhoneCodeHash(''); setError('')
    setQrSvg(''); setQrSessionId(''); setQrStatus(''); setLoginMode('qr')
    if (qrTimerRef.current) { clearInterval(qrTimerRef.current); qrTimerRef.current = null }
  }

  useEffect(() => {
    return () => { if (qrTimerRef.current) clearInterval(qrTimerRef.current) }
  }, [])

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此账号？')) return
    await api.deleteAccount(id); loadAccounts()
  }

  const handleToggle = async (id: number) => {
    await api.toggleAccount(id); loadAccounts()
  }

  const handleLogout = () => {
    localStorage.removeItem('admin_token')
    window.location.href = '/admin/login'
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📱</span>
          <h1 className="text-xl font-bold text-gray-800">Telegram 多账号管理后台</h1>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => { resetModal(); setShowAddModal(true) }}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-sm">
            + 添加账号
          </button>
          <button onClick={handleLogout} className="text-gray-500 hover:text-gray-700 text-sm transition">退出登录</button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6">
        {loading ? (
          <div className="text-center text-gray-400 py-20">加载中...</div>
        ) : accounts.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl shadow-sm border border-gray-100">
            <div className="text-5xl mb-4">👋</div>
            <h2 className="text-xl text-gray-800 mb-2">还没有账号</h2>
            <p className="text-gray-500 mb-6">点击「添加账号」开始使用</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {accounts.filter(a => !a.phone?.startsWith('qr_')).map(acc => (
              <div key={acc.id}
                className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition cursor-pointer"
                onClick={() => navigate(`/account/${acc.id}`)}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-xl text-blue-500 font-medium">
                      {(acc.first_name || acc.phone || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium text-gray-800">{acc.first_name || '未登录'}</div>
                      <div className="text-sm text-gray-500">@{acc.username || acc.phone}</div>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${acc.is_logged_in ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>
                    {acc.is_logged_in ? '已登录' : '未登录'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                  <span>📱 {acc.phone || '未知号码'}</span>
                  <span>·</span>
                  <span className={acc.is_active ? 'text-green-600' : 'text-red-500'}>
                    {acc.is_active ? '运行中' : '已停用'}
                  </span>
                </div>
                <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                  <button onClick={() => handleToggle(acc.id)}
                    className="flex-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg transition">
                    {acc.is_active ? '停用' : '启用'}
                  </button>
                  <button onClick={() => handleDelete(acc.id)}
                    className="text-xs bg-red-50 hover:bg-red-100 text-red-500 px-3 py-2 rounded-lg transition">
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 pt-6 pb-4">
              <h2 className="text-lg font-bold text-gray-800 mb-4">
                {step === 'qr' && loginMode === 'qr' && '扫码登录'}
                {step === 'phone' && loginMode === 'phone' && '手机号登录'}
                {step === 'code' && '输入验证码'}
                {step === '2fa' && '两步验证'}
                {step === 'done' && '✅ 登录成功'}
              </h2>

              {error && <div className="bg-red-50 border border-red-200 rounded-lg p-2 mb-3 text-red-600 text-sm">{error}</div>}

              {/* Mode toggle */}
              {(step === 'phone' || step === 'qr') && (
                <>
                  <div className="flex gap-2 mb-4 bg-gray-100 rounded-lg p-1">
                    <button onClick={() => setLoginMode('qr')}
                      className={`flex-1 py-2 rounded-md text-sm font-medium transition ${loginMode === 'qr' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>
                      📱 扫码登录
                    </button>
                    <button onClick={() => setLoginMode('phone')}
                      className={`flex-1 py-2 rounded-md text-sm font-medium transition ${loginMode === 'phone' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>
                      📞 手机号
                    </button>
                  </div>
                  {loginMode === 'qr' && (
                    <div className="flex flex-col items-center py-4">
                      {qrStatus === '' && (
                        <button onClick={startQRLogin} className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-xl text-sm font-medium transition">
                          生成二维码
                        </button>
                      )}
                      {qrStatus === 'loading' && <div className="text-gray-500 text-sm py-8">正在生成二维码...</div>}
                      {qrStatus === 'waiting' && (
                        <>
                          <div className="border border-gray-200 rounded-xl p-3 mb-3" dangerouslySetInnerHTML={{ __html: qrSvg }} />
                          <p className="text-sm text-gray-500 text-center">
                            打开 Telegram → 设置 → 设备 → 添加设备<br/>扫描上方二维码登录
                          </p>
                          <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
                            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                            等待扫码中...
                          </div>
                        </>
                      )}
                      {qrStatus === 'expired' && (
                        <div className="text-center py-4">
                          <p className="text-gray-500 text-sm mb-3">二维码已过期</p>
                          <button onClick={startQRLogin} className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">
                            重新生成
                          </button>
                        </div>
                      )}
                      {qrStatus === 'success' && <p className="text-green-600 text-sm py-4">✅ 登录成功！</p>}
                    </div>
                  )}
                </>
              )}

              {(step === 'phone' || step === 'qr') && loginMode === 'phone' && (
                <div className="space-y-3">
                  <input value={phone} onChange={e => setPhone(e.target.value)}
                    placeholder="+8613800138000"
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                  <button onClick={handleAddAccount} className="w-full bg-blue-500 hover:bg-blue-600 text-white py-3 rounded-lg transition font-medium">
                    发送验证码
                  </button>
                </div>
              )}

              {step === 'code' && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600 mb-2">验证码已发送到 <span className="font-medium">{phone}</span></p>
                  <input value={code} onChange={e => setCode(e.target.value)}
                    placeholder="输入验证码"
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                  <button onClick={handleVerifyCode} className="w-full bg-blue-500 hover:bg-blue-600 text-white py-3 rounded-lg transition font-medium">
                    验证
                  </button>
                </div>
              )}

              {step === '2fa' && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600 mb-2">此账号开启了两步验证</p>
                  <input type="password" value={twofa} onChange={e => setTwofa(e.target.value)}
                    placeholder="输入两步验证密码"
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                  <button onClick={handleVerify2FA} className="w-full bg-blue-500 hover:bg-blue-600 text-white py-3 rounded-lg transition font-medium">
                    验证
                  </button>
                </div>
              )}

              {step === 'done' && <p className="text-green-600 text-center py-4">账号已成功添加！</p>}
            </div>

            <div className="px-6 pb-4">
              <button onClick={() => { setShowAddModal(false); resetModal() }}
                className="w-full text-gray-500 hover:text-gray-700 text-sm transition py-2">
                {step === 'done' ? '关闭' : '取消'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
