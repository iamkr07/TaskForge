import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTasks } from '../../context/TaskContext';
import { db } from '../../firebase';
import { collection, addDoc, onSnapshot, query, where, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { LogOut, Layout, Plus, X, Calendar, User, Flag, ArrowLeft, CheckCircle, Clock } from 'lucide-react';

const ManagerDashboard = () => {
  const { user, logout } = useAuth();
  const { addTask, updateTaskStatus } = useTasks();
  
  const [selectedProject, setSelectedProject] = useState(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [projectTasks, setProjectTasks] = useState([]);
  const [managerProjects, setManagerProjects] = useState([]);
  const [projectTaskCounts, setProjectTaskCounts] = useState({});
  
  // Task Form State
  const [taskData, setTaskData] = useState({
    title: '',
    description: '',
    assignedTo: '',
    priority: 'Medium',
    deadline: '',
    status: 'To Do'
  });

  const [statusFilter, setStatusFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');

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
    const usersRef = collection(db, 'users');

    const unsubscribe = onSnapshot(
      usersRef,
      snapshot => {
        const filteredUsers = snapshot.docs
          .map(docSnap => {
            const data = docSnap.data();
            if (data.role !== 'User') {
              return null;
            }
            return {
              id: docSnap.id,
              name: data.name,
              role: data.role,
              email: data.email,
            };
          })
          .filter(Boolean);

        setUsers(filteredUsers);
      },
      error => {
        console.error('Failed to load users', error);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      return undefined;
    }

    const projectsRef = collection(db, 'projects');
    const managerQuery = query(projectsRef, where('assignedManager', '==', user.id));

    const unsubscribe = onSnapshot(
      managerQuery,
      snapshot => {
        const loadedProjects = snapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setManagerProjects(loadedProjects);
      },
      error => {
        console.error('Failed to load manager projects', error);
      }
    );

    return () => {
      unsubscribe();
      setManagerProjects([]);
    };
  }, [user]);

  // if a project is removed from the list (deleted by admin), clear selection
  useEffect(() => {
    if (selectedProject && !managerProjects.some(p => p.id === selectedProject.id)) {
      setSelectedProject(null);
      setProjectTasks([]);
    }
  }, [managerProjects, selectedProject]);

  // keep a realtime count of tasks in each project subcollection to avoid stale totals
  useEffect(() => {
    const unsubscribes = [];
    managerProjects.forEach(proj => {
      const tasksRef = collection(db, 'projects', proj.id, 'tasks');
      const unsub = onSnapshot(tasksRef, snap => {
        setProjectTaskCounts(prev => ({ ...prev, [proj.id]: snap.size }));
      });
      unsubscribes.push(unsub);
    });

    return () => {
      unsubscribes.forEach(u => u());
      setProjectTaskCounts({});
    };
  }, [managerProjects]);


  useEffect(() => {
    if (!selectedProject) {
      return undefined;
    }

    const tasksRef = collection(db, 'projects', selectedProject.id, 'tasks');

    const unsubscribe = onSnapshot(
      tasksRef,
      snapshot => {
        const loadedTasks = snapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        // remove any duplicates by id (unlikely but protects against repeated writes)
        const unique = Array.from(new Map(loadedTasks.map(t => [t.id, t])).values());
        setProjectTasks(unique);
      },
      error => {
        console.error('Failed to load project tasks', error);
      }
    );

    return () => {
      unsubscribe();
      setProjectTasks([]);
    };
  }, [selectedProject]);

  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!selectedProject) return;

    const projectDeadline = selectedProject.endDate ? new Date(selectedProject.endDate) : null;
    const taskDeadlineDate = taskData.deadline ? new Date(taskData.deadline) : null;

    if (
      projectDeadline &&
      taskDeadlineDate &&
      !Number.isNaN(projectDeadline.getTime()) &&
      !Number.isNaN(taskDeadlineDate.getTime()) &&
      taskDeadlineDate > projectDeadline
    ) {
      window.alert('Task deadline cannot exceed project deadline.');
      return;
    }

    try {
      // use the shared context helper which writes to the project subcollection
      await addTask({
        ...taskData,
        projectId: selectedProject.id,
        assignedByName: user.name,
        assignedById: user.id,
      });
      // snapshot listener will pick up the new task and update projectTasks,
      // so we don't manually push it here (avoids duplicates)
    } catch (error) {
      console.error('Failed to create project task', error);
    }

    setTaskData({
      title: '',
      description: '',
      assignedTo: '',
      priority: 'Medium',
      deadline: '',
      status: 'To Do'
    });
    setIsTaskModalOpen(false);
  };

  const handleApproveTask = async (task) => {
    if (!selectedProject) return;
    if (task.status !== 'Completed') return;

    try {
      // only update once; context helper already writes to project
      await updateTaskStatus(selectedProject.id, task.id, 'Approved', user.name);
      // snapshot will refresh projectTasks; local update provides immediate UI
      setProjectTasks(prev =>
        prev.map(t =>
          t.id === task.id
            ? { ...t, status: 'Approved' }
            : t
        )
      );
    } catch (error) {
      console.error('Failed to approve task', error);
    }
  };

  const handleMarkProjectCompleted = async () => {
    if (!selectedProject) return;
    if (!projectTasks.length) return;

    const allApproved = projectTasks.every(task => task.status === 'Approved');
    if (!allApproved) return;

    try {
      const projectRef = doc(db, 'projects', selectedProject.id);
      await updateDoc(projectRef, {
        status: 'In Review',
        managerCompletedAt: serverTimestamp(),
        managerCompletedBy: user.id,
      });
      setSelectedProject(prev => (prev ? { ...prev, status: 'In Review' } : prev));
    } catch (error) {
      console.error('Failed to mark project as completed by manager', error);
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority.toLowerCase()) {
      case 'high': return 'text-red-600 bg-red-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      case 'low': return 'text-green-600 bg-green-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusBadgeColor = (status) => {
    const value = (status || '').toLowerCase();
    switch (value) {
      case 'active':
        return 'bg-blue-100 text-blue-800 border border-blue-200';
      case 'in review':
        return 'bg-amber-100 text-amber-800 border border-amber-200';
      case 'completed':
        return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
      default:
        return 'bg-gray-100 text-gray-800 border border-gray-200';
    }
  };

  const filteredProjectTasks = projectTasks.filter(task => {
    const statusMatch = statusFilter === 'All' || task.status === statusFilter;
    const priorityMatch = priorityFilter === 'All' || task.priority === priorityFilter;
    return statusMatch && priorityMatch;
  });

  const activeProjects = managerProjects.filter(project => project.status === 'Active');
  const inReviewProjects = managerProjects.filter(project => project.status === 'In Review');
  const completedProjects = managerProjects.filter(project => project.status === 'Completed');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <nav className="bg-white shadow-sm border-b border-gray-200 px-6 py-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center space-x-3">
          <Layout className="text-blue-600" size={24} />
          <h1 className="text-xl font-bold text-gray-800">Manager Dashboard</h1>
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

      <main className="p-6 max-w-7xl mx-auto">
        {!selectedProject ? (
          <>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">My Projects</h2>
            {/* summary counts */}
            <div className="flex flex-wrap gap-4 mb-6">
              <div className="px-4 py-2 bg-white rounded-lg shadow text-sm font-medium">
                Active: {activeProjects.length}
              </div>
              <div className="px-4 py-2 bg-white rounded-lg shadow text-sm font-medium">
                In Review: {inReviewProjects.length}
              </div>
              <div className="px-4 py-2 bg-white rounded-lg shadow text-sm font-medium">
                Completed: {completedProjects.length}
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-6">My Projects</h2>

            <section className="mb-8">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Active Projects</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeProjects.length > 0 ? (
                  activeProjects.map((project) => {
                    const totalTasks = projectTaskCounts[project.id] ?? 0;
                    return (
                      <div 
                        key={project.id} 
                        onClick={() => {
                          setSelectedProject(project);
                        }}
                        className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-all cursor-pointer group"
                      >
                        <div className="flex justify-between items-start mb-4">
                          <h3 className="text-lg font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{project.name}</h3>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusBadgeColor(project.status)}`}>
                            {project.status}
                          </span>
                        </div>
                        <p className="text-gray-600 text-sm mb-4 line-clamp-2">{project.description}</p>
                        <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 mb-2">
                          <span>Start: {formatDate(project.startDate)}</span>
                          <span>End: {formatDate(project.endDate)}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm text-gray-500">
                          <span>Tasks: {totalTasks}</span>
                          <span className="text-blue-600 font-medium">View Details →</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="col-span-full text-center py-8 bg-white rounded-xl border border-gray-200 border-dashed">
                    <p className="text-gray-500">No active projects.</p>
                  </div>
                )}
              </div>
            </section>

            <section className="mb-8">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Projects In Review</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {inReviewProjects.length > 0 ? (
                  inReviewProjects.map((project) => {
                    const totalTasks = projectTaskCounts[project.id] ?? 0;
                    return (
                      <div 
                        key={project.id} 
                        onClick={() => {
                          setSelectedProject(project);
                        }}
                        className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-all cursor-pointer group"
                      >
                        <div className="flex justify-between items-start mb-4">
                          <h3 className="text-lg font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{project.name}</h3>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusBadgeColor(project.status)}`}>
                            {project.status}
                          </span>
                        </div>
                        <p className="text-gray-600 text-sm mb-4 line-clamp-2">{project.description}</p>
                        <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 mb-2">
                          <span>Start: {formatDate(project.startDate)}</span>
                          <span>End: {formatDate(project.endDate)}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm text-gray-500">
                          <span>Tasks: {totalTasks}</span>
                          <span className="text-blue-600 font-medium">View Details →</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="col-span-full text-center py-8 bg-white rounded-xl border border-gray-200 border-dashed">
                    <p className="text-gray-500">No projects in review.</p>
                  </div>
                )}
              </div>
            </section>

            <section>
              <h3 className="text-lg font-bold text-gray-800 mb-4">Completed Projects</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {completedProjects.length > 0 ? (
                  completedProjects.map((project) => {
                    const totalTasks = projectTaskCounts[project.id] ?? 0;
                    return (
                      <div 
                        key={project.id} 
                        onClick={() => {
                          setSelectedProject(project);
                        }}
                        className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-all cursor-pointer group"
                      >
                        <div className="flex justify-between items-start mb-4">
                          <h3 className="text-lg font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{project.name}</h3>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusBadgeColor(project.status)}`}>
                            {project.status}
                          </span>
                        </div>
                        <p className="text-gray-600 text-sm mb-4 line-clamp-2">{project.description}</p>
                        <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 mb-2">
                          <span>Start: {formatDate(project.startDate)}</span>
                          <span>End: {formatDate(project.endDate)}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm text-gray-500">
                          <span>Tasks: {totalTasks}</span>
                          <span className="text-blue-600 font-medium">View Details →</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="col-span-full text-center py-8 bg-white rounded-xl border border-gray-200 border-dashed">
                    <p className="text-gray-500">No completed projects yet.</p>
                  </div>
                )}
              </div>
            </section>
          </>
        ) : (
          /* Project Details & Tasks View */
          <div className="space-y-6">
            <button 
              onClick={() => setSelectedProject(null)}
              className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft size={20} />
              <span>Back to Projects</span>
            </button>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">{selectedProject.name}</h2>
                  <p className="text-gray-600">{selectedProject.description}</p>
                  {selectedProject.status === 'In Review' && (
                    <div className="mt-2 inline-block px-3 py-1 text-sm font-medium text-yellow-800 bg-yellow-100 rounded">
                      Awaiting admin approval
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setIsTaskModalOpen(true)}
                  className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus size={20} />
                  <span>Create Task</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <span className="text-sm text-gray-500 block mb-1">Start Date</span>
                  <span className="font-medium">{formatDate(selectedProject.startDate)}</span>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <span className="text-sm text-gray-500 block mb-1">End Date</span>
                  <span className="font-medium">{formatDate(selectedProject.endDate)}</span>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <span className="text-sm text-gray-500 block mb-1">Status</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusBadgeColor(selectedProject.status)}`}>
                    {selectedProject.status}
                  </span>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <span className="text-sm text-gray-500 block mb-1">Total Tasks</span>
                  <span className="font-medium">{projectTasks.length}</span>
                </div>
              </div>

              {selectedProject.status === 'Active' &&
                projectTasks.length > 0 &&
                projectTasks.every(task => task.status === 'Approved') && (
                  <div className="mb-6 flex justify-end">
                    <button
                      type="button"
                      onClick={handleMarkProjectCompleted}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                    >
                      Mark Project as Completed
                    </button>
                  </div>
                )}

              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                <h3 className="text-lg font-bold text-gray-800">Tasks</h3>
                <div className="flex flex-wrap gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="w-40 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    >
                      <option value="All">All</option>
                      <option value="To Do">To Do</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Completed">Completed</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
                    <select
                      value={priorityFilter}
                      onChange={(e) => setPriorityFilter(e.target.value)}
                      className="w-40 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    >
                      <option value="All">All</option>
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-md font-semibold text-gray-800 mb-3">Pending Tasks</h4>
                  <div className="space-y-3">
                    {filteredProjectTasks.filter(task => task.status !== 'Approved').length > 0 ? (
                      filteredProjectTasks
                        .filter(task => task.status !== 'Approved')
                        .map((task) => (
                          <div key={task.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                            <div className="flex justify-between items-start">
                              <div className="space-y-1">
                                <h5 className="font-medium text-gray-900">{task.title}</h5>
                                <p className="text-sm text-gray-600">{task.description}</p>
                              </div>
                              <span className={`px-2 py-1 rounded text-xs font-medium ${getPriorityColor(task.priority)}`}>
                                {task.priority}
                              </span>
                            </div>
                            {task.status === 'Completed' && (
                              <div className="mt-2">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                                  <Clock size={12} className="mr-1" />
                                  Ready for Approval
                                </span>
                              </div>
                            )}
                            <div className="mt-3 flex items-center space-x-4 text-sm text-gray-500">
                              <div className="flex items-center space-x-2">
                                <User size={16} />
                                <span>Assigned: {users.find(u => u.id === task.assignedTo)?.name || 'Unassigned'}</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Calendar size={16} />
                                <span>Due: {formatDate(task.deadline)}</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Flag size={16} />
                                <span>{task.status}</span>
                              </div>
                            </div>
                            {(task.status === 'Completed' || task.status === 'Approved') && (
                              <p className="mt-2 text-xs text-gray-500">
                                Completion comment:{' '}
                                {task.completionComment && task.completionComment.trim()
                                  ? task.completionComment
                                  : 'No comment provided.'}
                              </p>
                            )}
                            {/* approve button always visible; enabled only when the task is completed */}
                            <div className="mt-3 flex justify-end">
                              <button
                                type="button"
                                onClick={() => handleApproveTask(task)}
                                disabled={task.status !== 'Completed'}
                                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                                  task.status === 'Completed'
                                    ? 'bg-green-600 text-white hover:bg-green-700'
                                    : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                }`}
                              >
                                Approve
                              </button>
                            </div>
                          </div>
                        ))
                    ) : (
                      <p className="text-gray-500 text-sm">No pending tasks.</p>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="text-md font-semibold text-gray-800 mb-3">Approved Tasks</h4>
                  <div className="space-y-3">
                    {filteredProjectTasks.filter(task => task.status === 'Approved').length > 0 ? (
                      filteredProjectTasks
                        .filter(task => task.status === 'Approved')
                        .map((task) => (
                          <div key={task.id} className="border border-gray-200 rounded-lg p-4 bg-green-50">
                            <div className="flex justify-between items-start">
                              <div className="space-y-1">
                                <h5 className="font-medium text-gray-900">{task.title}</h5>
                                <p className="text-sm text-gray-600">{task.description}</p>
                              </div>
                              <span className={`px-2 py-1 rounded text-xs font-medium ${getPriorityColor(task.priority)}`}>
                                {task.priority}
                              </span>
                            </div>
                            <div className="mt-2">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <CheckCircle size={12} className="mr-1" />
                                Approved
                              </span>
                            </div>
                            <div className="mt-3 flex items-center space-x-4 text-sm text-gray-500">
                              <div className="flex items-center space-x-2">
                                <User size={16} />
                                <span>Assigned: {users.find(u => u.id === task.assignedTo)?.name || 'Unassigned'}</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Calendar size={16} />
                                <span>Due: {formatDate(task.deadline)}</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Flag size={16} />
                                <span>{task.status}</span>
                              </div>
                            </div>
                            <p className="mt-2 text-xs text-gray-500">
                              Completion comment:{' '}
                              {task.completionComment && task.completionComment.trim()
                                ? task.completionComment
                                : 'No comment provided.'}
                            </p>
                          </div>
                        ))
                    ) : (
                      <p className="text-gray-500 text-sm">No approved tasks yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Create Task Modal */}
      {isTaskModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-900">Create New Task</h3>
              <button
                onClick={() => setIsTaskModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Task Title</label>
                <input
                  type="text"
                  required
                  value={taskData.title}
                  onChange={(e) => setTaskData({...taskData, title: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g. Design Homepage"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  required
                  value={taskData.description}
                  onChange={(e) => setTaskData({...taskData, description: e.target.value})}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Assigned User</label>
                  <select
                    required
                    value={taskData.assignedTo}
                    onChange={(e) => setTaskData({...taskData, assignedTo: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">Select User</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <select
                    value={taskData.priority}
                    onChange={(e) => setTaskData({...taskData, priority: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Deadline</label>
                  <input
                    type="date"
                    required
                    value={taskData.deadline}
                    onChange={(e) => setTaskData({...taskData, deadline: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={taskData.status}
                    onChange={(e) => setTaskData({...taskData, status: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="To Do">To Do</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setIsTaskModalOpen(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManagerDashboard;
