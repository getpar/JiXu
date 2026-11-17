import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import HomePage from './pages/HomePage'

// 首屏只留首页；其余页面按需加载，避免 @ant-design/charts 这类大依赖拖慢启动
const AddExpensePage = lazy(() => import('./pages/AddExpensePage'))
const HistoryPage = lazy(() => import('./pages/HistoryPage'))
const StatsPage = lazy(() => import('./pages/StatsPage'))
const CategoryPage = lazy(() => import('./pages/CategoryPage'))
const RecurringPage = lazy(() => import('./pages/RecurringPage'))
const TodosPage = lazy(() => import('./pages/TodosPage'))
const QuickAddPage = lazy(() => import('./pages/QuickAddPage'))
const RecycleBinPage = lazy(() => import('./pages/RecycleBinPage'))
const SavingsPage = lazy(() => import('./pages/SavingsPage'))

function App(): JSX.Element {
  return (
    <Suspense fallback={<div className="page-pending" aria-busy="true" />}>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Navigate to="/home" replace />} />
          <Route path="home" element={<HomePage />} />
          <Route path="add" element={<AddExpensePage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="stats" element={<StatsPage />} />
          <Route path="categories" element={<CategoryPage />} />
          <Route path="recurring" element={<RecurringPage />} />
          <Route path="todos" element={<TodosPage />} />
          <Route path="savings" element={<SavingsPage />} />
          <Route path="quick-add" element={<QuickAddPage />} />
          <Route path="recycle-bin" element={<RecycleBinPage />} />
        </Route>
      </Routes>
    </Suspense>
  )
}

export default App
