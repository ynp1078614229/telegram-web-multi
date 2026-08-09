import { useState } from 'react'
import { api } from '../services/api'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.login(username, password)
      if (res.token) {
        localStorage.setItem('admin_token', res.token)
        window.location.href = '/admin/'
      } else {
        setError(res.error || 'Login failed')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">📱</div>
          <h1 className="text-2xl font-bold text-white">Telegram 多账号管理</h1>
          <p className="text-dark-400 mt-1">Admin Panel</p>
        </div>
        <form onSubmit={handleLogin} className="bg-dark-800 rounded-2xl p-8 shadow-xl border border-dark-700">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4 text-red-400 text-sm">
              {error}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-dark-300 mb-1.5">管理员账号</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full bg-dark-900 border border-dark-600 rounded-lg px-4 py-3 text-white placeholder-dark-500 focus:outline-none focus:border-primary transition"
                placeholder="请输入管理员账号"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-dark-300 mb-1.5">密码</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-dark-900 border border-dark-600 rounded-lg px-4 py-3 text-white placeholder-dark-500 focus:outline-none focus:border-primary transition"
                placeholder="请输入密码"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-blue-600 disabled:opacity-50 text-white font-medium py-3 rounded-lg transition mt-2"
            >
              {loading ? '登录中...' : '登 录'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
