import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTasks } from '../../context/TaskContext';
import { db } from '../../firebase';
import { collection, collectionGroup, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { LogOut, User as UserIcon, Clock, CheckCircle, Circle, MessageSquare, Send, Activity, X } from 'lucide-react';

const UserDashboard = () => {
  const { user, logout } = useAuth();
  const { updateTaskStatus, addComment } = useTasks();
  const [selectedTask, setSelectedTask] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [myTasks, setMyTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(true);

  const formatDate = (value) => {
    if (!value) return '';
    const date = value instanceof Date
      ? value
      : typeof value.toDate === 'function'
        ? value.toDate()
        : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  useEffect(() => {
    if (!user?.id) {
      // clear list if there's no logged-in user
      setMyTasks([]);
      setLoadingTasks(false);
      return undefined;
    }

    // clear any previous tasks while we wait for new snapshot
    setMyTasks([]);
    setLoadingTasks(true);

    // listen on all project task subcollections instead of the global list
    const tasksRef = collectionGroup(db, 'tasks');
    const q = query(tasksRef, where('assignedTo', '==', user.id));

    // prefetch once to avoid blank UI in case snapshot doesn't fire immediately
    const fetchOnce = async () => {
      try {
        const snap = await getDocs(q);
        const tasks = snap.docs
          .filter(docSnap => !docSnap.ref.path.startsWith('tasks/'))
          .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
        const unique = Array.from(new Map(tasks.map(t => [t.id, t])).values());
        setMyTasks(unique);
      } catch (err) {
        console.error('Initial tasks fetch failed', err);
      }
    };
    fetchOnce();

    const unsubscribe = onSnapshot(
      q,
      snapshot => {
        const tasks = snapshot.docs
          .filter(docSnap => !docSnap.ref.path.startsWith('tasks/')) // exclude root-level tasks
          .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
        const unique = Array.from(new Map(tasks.map(t => [t.id, t])).values());
        setMyTasks(unique);
        setLoadingTasks(false);
      },
      error => {
        console.error('Failed to load tasks for user', error);
        setLoadingTasks(false);
      }
    );

    return () => unsubscribe();
  }, [user?.id]);

  // clear selected task if it has been deleted/removed from list (e.g. project deleted)
  useEffect(() => {
    if (selectedTask && !myTasks.find(t => t.id === selectedTask.id)) {
      setSelectedTask(null);
    }
  }, [myTasks, selectedTask]);

  const handleStatusUpdate = async (newStatus) => {
    if (!selectedTask) return;

    try {
      await updateTaskStatus(selectedTask.projectId, selectedTask.id, newStatus, user.name);

      setSelectedTask(prev => ({
        ...prev,
        status: newStatus,
        completedAt: newStatus === 'Completed' ? new Date().toISOString() : (newStatus !== 'Completed' ? undefined : prev.completedAt),
        activityLog: [
          {
            id: Math.random().toString(),
            action: `Status changed to ${newStatus}`,
            user: user.name,
            timestamp: new Date().toISOString()
          },
          ...(prev.activityLog || [])
        ]
      }));

      setMyTasks(prev =>
        prev.map(task =>
          task.id === selectedTask.id
            ? {
                ...task,
                status: newStatus,
                completedAt: newStatus === 'Completed' ? new Date().toISOString() : (newStatus !== 'Completed' ? undefined : task.completedAt),
              }
            : task
        )
      );
    } catch (error) {
      console.error('Failed to update task status', error);
    }
  };

  const handleAddComment = (e) => {
    e.preventDefault();
    if (selectedTask && newComment.trim()) {
      addComment(selectedTask.projectId, selectedTask.id, newComment, user.name, selectedTask.status);
      // Update local selected task state
      setSelectedTask(prev => ({
        ...prev,
        comments: [
          {
            id: Math.random().toString(),
            text: newComment,
            user: user.name,
            timestamp: new Date().toISOString()
          },
          ...(prev.comments || [])
        ],
        activityLog: [
          {
            id: Math.random().toString(),
            action: 'Comment added',
            user: user.name,
            timestamp: new Date().toISOString()
          },
          ...(prev.activityLog || [])
        ]
      }));
      setNewComment('');
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'Completed': return <CheckCircle className="text-green-600" size={20} />;
      case 'In Progress': return <Clock className="text-blue-600" size={20} />;
      default: return <Circle className="text-gray-400" size={20} />;
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority.toLowerCase()) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Navbar */}
      <nav className="bg-white shadow-sm border-b border-gray-200 px-6 py-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center space-x-3">
          <UserIcon className="text-blue-600" size={24} />
          <h1 className="text-xl font-bold text-gray-800">My Dashboard</h1>
        </div>
        <div className="flex items-center space-x-4">
          <span className="text-sm text-gray-600">Welcome, {user?.name}</span>
          <button
            onClick={logout}
            className="flex items-center space-x-2 text-sm text-red-600 hover:text-red-700 font-medium"
          >
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>
      </nav>

      <div className="flex-1 flex overflow-hidden">
        {/* Task List Sidebar */}
        <aside className="w-1/3 border-r border-gray-200 bg-white overflow-y-auto p-6">
          <div className="mb-6 flex flex-wrap gap-3">
            <div className="px-3 py-2 bg-white rounded-lg shadow text-sm font-medium">
              Ongoing: {myTasks.filter(task => ['To Do','In Progress'].includes(task.status)).length}
            </div>
            <div className="px-3 py-2 bg-white rounded-lg shadow text-sm font-medium">
              Completed: {myTasks.filter(task => ['Completed','Approved'].includes(task.status)).length}
            </div>
          </div>
          <div className="space-y-6">
            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">
                Ongoing Tasks ({myTasks.filter(task => ['To Do','In Progress'].includes(task.status)).length})
                {loadingTasks && (
                  <span className="ml-2 text-sm text-gray-400">(loading…)</span>
                )}
              </h2>
              <div className="space-y-3">
                {loadingTasks ? (
                  <p className="text-gray-500 text-sm">Loading tasks…</p>
                ) : myTasks.filter(task => ['To Do','In Progress'].includes(task.status)).length > 0 ? (
                  myTasks
                    .filter(task => ['To Do','In Progress'].includes(task.status))
                    .map(task => (
                      <div
                        key={task.id}
                        onClick={() => setSelectedTask(task)}
                        className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                          selectedTask?.id === task.id
                            ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                            : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-medium text-gray-900 line-clamp-1">{task.title}</h3>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor(task.priority)}`}>
                            {task.priority}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm text-gray-500">
                          <span className="flex items-center space-x-1">
                            {getStatusIcon(task.status)}
                            <span>{task.status}</span>
                          </span>
                          <span className="text-xs">
                            Due: {formatDate(task.deadline)}
                          </span>
                        </div>
                      </div>
                    ))
                ) : (
                  <p className="text-gray-500 text-sm">No ongoing tasks.</p>
                )}
              </div>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">
                Completed Tasks ({myTasks.filter(task => ['Completed','Approved'].includes(task.status)).length})
              </h2>
              <div className="space-y-3">
                {loadingTasks ? (
                  <p className="text-gray-500 text-sm">Loading tasks…</p>
                ) : myTasks.filter(task => ['Completed','Approved'].includes(task.status)).length > 0 ? (
                  myTasks
                    .filter(task => ['Completed','Approved'].includes(task.status))
                    .map(task => (
                      <div
                        key={task.id}
                        onClick={() => setSelectedTask(task)}
                        className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                          selectedTask?.id === task.id
                            ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                            : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-medium text-gray-900 line-clamp-1">{task.title}</h3>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor(task.priority)}`}>
                            {task.priority}
                          </span>
                        </div>
                        {task.status === 'Completed' && (
                          <div className="mt-2">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                              <Clock size={12} className="mr-1" />
                              Awaiting Approval
                            </span>
                          </div>
                        )}
                        {task.status === 'Approved' && (
                          <div className="mt-2">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <CheckCircle size={12} className="mr-1" />
                              Approved
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between text-sm text-gray-500">
                          <span className="flex items-center space-x-1">
                            {getStatusIcon(task.status)}
                            <span>{task.status}</span>
                          </span>
                          <span className="text-xs">
                            Due: {formatDate(task.deadline)}
                          </span>
                          {task.completedAt && (
                            <span className="text-xs text-gray-400 block">
                              Completed: {formatDate(task.completedAt)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                ) : (
                  <p className="text-gray-500 text-sm">No completed tasks.</p>
                )}
              </div>
            </section>
          </div>
        </aside>

        {/* Task Details Main Area */}
        <main className="flex-1 overflow-y-auto p-8 bg-gray-50">
          {selectedTask ? (
            <div className="max-w-3xl mx-auto space-y-6">
              {/* Header */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">{selectedTask.title}</h1>
                    <div className="flex items-center space-x-4 text-sm text-gray-500">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getPriorityColor(selectedTask.priority)}`}>
                        {selectedTask.priority} Priority
                      </span>
                      <span>Due: {formatDate(selectedTask.deadline)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end space-y-2">
                    <span className="text-sm font-medium text-gray-700">Status</span>
                    {selectedTask.status === 'Completed' && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200 mb-1">
                        <Clock size={12} className="mr-1" />
                        Awaiting Manager Approval
                      </span>
                    )}
                    {selectedTask.status === 'Approved' && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 mb-1">
                        <CheckCircle size={12} className="mr-1" />
                        Approved
                      </span>
                    )}
                    <select
                      value={selectedTask.status}
                      onChange={(e) => handleStatusUpdate(e.target.value)}
                      disabled={selectedTask.status === 'Approved'}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-400"
                    >
                      {selectedTask.status === 'To Do' && (
                        <>
                          <option value="To Do">To Do</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Completed">Completed</option>
                        </>
                      )}
                      {selectedTask.status === 'In Progress' && (
                        <>
                          <option value="In Progress">In Progress</option>
                          <option value="Completed">Completed</option>
                        </>
                      )}
                      {selectedTask.status === 'Completed' && (
                        <option value="Completed">Completed</option>
                      )}
                      {selectedTask.status !== 'To Do' &&
                        selectedTask.status !== 'In Progress' &&
                        selectedTask.status !== 'Completed' && (
                          <>
                            <option value="To Do">To Do</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Completed">Completed</option>
                          </>
                        )}
                    </select>
                  </div>
                </div>

                <div className="prose prose-sm max-w-none text-gray-600">
                  <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-2">Description</h3>
                  <p>{selectedTask.description}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Comments Section */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col h-96">
                  <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center space-x-2">
                    <MessageSquare size={20} />
                    <span>Comments</span>
                  </h3>
                  
                  <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
                    {selectedTask.comments && selectedTask.comments.length > 0 ? (
                      selectedTask.comments.map(comment => (
                        <div key={comment.id} className="bg-gray-50 rounded-lg p-3">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-medium text-sm text-gray-900">{comment.user}</span>
                            <span className="text-xs text-gray-500">
                              {formatDate(comment.timestamp)}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600">{comment.text}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-400 text-sm text-center italic py-4">No comments yet.</p>
                    )}
                  </div>

                  <form onSubmit={handleAddComment} className="mt-auto">
                    <div className="relative">
                      <input
                        type="text"
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Add a comment..."
                        className="w-full pl-4 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      />
                      <button 
                        type="submit"
                        disabled={!newComment.trim()}
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 text-blue-600 hover:text-blue-700 disabled:text-gray-400"
                      >
                        <Send size={16} />
                      </button>
                    </div>
                  </form>
                </div>

                {/* Activity Log Section */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 h-96 overflow-y-auto">
                  <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center space-x-2">
                    <Activity size={20} />
                    <span>Activity Log</span>
                  </h3>
                  
                  <div className="space-y-4">
                    {selectedTask.activityLog && selectedTask.activityLog.length > 0 ? (
                      selectedTask.activityLog.map(log => (
                        <div key={log.id} className="flex items-start space-x-3">
                          <div className="mt-1 w-2 h-2 rounded-full bg-blue-500 flex-shrink-0"></div>
                          <div>
                            <p className="text-sm text-gray-800">
                              <span className="font-medium">{log.user}</span> {log.action}
                            </p>
                            <span className="text-xs text-gray-500">
                              {formatDate(log.timestamp)}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-400 text-sm text-center italic">No activity yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <CheckCircle size={32} />
              </div>
              <p className="text-lg font-medium text-gray-500">Select a task to view details</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default UserDashboard;
