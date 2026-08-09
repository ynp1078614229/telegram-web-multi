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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">📱</div>
          <h1 className="text-2xl font-bold text-gray-800">Telegram 多账号管理</h1>
          <p className="text-gray-500 mt-1">Admin Panel</p>
        </div>
        <form onSubmit={handleLogin} className="bg-white rounded-2xl p-8 shadow-lg border border-gray-200">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-600 text-sm">
              {error}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1.5">管理员账号</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
                placeholder="请输入管理员账号"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1.5">密码</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
                placeholder="请输入密码"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-medium py-3 rounded-lg transition mt-2"
            >
              {loading ? '登录中...' : '登 录'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
