import React, { useState, useEffect } from 'react'
import { Route, Routes, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import Auth from './pages/Auth'
import axios from 'axios'
import { useDispatch, useSelector } from 'react-redux'
import { setUserData } from './redux/userSlice'
import InterviewPage from './pages/InterviewPage'
import InterviewHistory from './pages/interviewHistory'
import Pricing from './pages/Pricing'
import InterviewReport from './pages/InterviewReport'

export const ServerUrl = ""

// ProtectedRoute component to handle auth redirects
const ProtectedRoute = ({ children }) => {
  const { userData } = useSelector((state) => state.user);
  if (!userData) {
    return <Navigate to="/auth" />;
  }
  return children;
};

function App() {
  const [loading, setLoading] = useState(true);
  const dispatch = useDispatch()

  useEffect(() => {
    const getUser = async () => {
      try {
        const result = await axios.get(ServerUrl + "/api/user/current-user", { withCredentials: true })
        dispatch(setUserData(result.data))
      } catch (error) {
        console.log("Auth error, user not logged in", error)
        dispatch(setUserData(null))
      } finally {
        setLoading(false)
      }
    }
    getUser()
  }, [dispatch])

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <Routes>
      <Route path='/' element={<Home />} />
      <Route path='/auth' element={<Auth />} />
      <Route path='/pricing' element={<Pricing />} />

      {/* Protected Routes */}
      <Route path='/interview' element={<ProtectedRoute><InterviewPage /></ProtectedRoute>} />
      <Route path='/history' element={<ProtectedRoute><InterviewHistory /></ProtectedRoute>} />
      <Route path='/report/:id' element={<ProtectedRoute><InterviewReport /></ProtectedRoute>} />
    </Routes>
  )
}

export default App
