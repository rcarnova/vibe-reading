import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Home from './pages/Home'
import Library from './pages/Library'
import BookDetail from './pages/BookDetail'
import ReadingPath from './pages/ReadingPath'
import AddBook from './pages/AddBook'
import SavedPaths from './pages/SavedPaths'
import ReaderProfile from './pages/ReaderProfile'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import Import from './pages/Import'
import { ProtectedRoute } from './components/ProtectedRoute'
import { ScrollToTop } from './components/ScrollToTop'

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-paper">
        <ScrollToTop />
        <Navbar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/biblioteca" element={<Library />} />
          <Route path="/book/:id" element={<BookDetail />} />
          <Route path="/reading-path" element={<ReadingPath />} />
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/add-book" element={<ProtectedRoute><AddBook /></ProtectedRoute>} />
          <Route path="/percorsi-salvati" element={<ProtectedRoute><SavedPaths /></ProtectedRoute>} />
          <Route path="/profilo" element={<ProtectedRoute><ReaderProfile /></ProtectedRoute>} />
          <Route path="/importa" element={<ProtectedRoute><Import /></ProtectedRoute>} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
