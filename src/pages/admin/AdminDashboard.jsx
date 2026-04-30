import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useProjects } from '../../context/ProjectContext';
import { LogOut, Shield, Plus, Calendar, Activity, X, User, Trash2 } from 'lucide-react';
import { db } from '../../firebase';
import { collection, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';

const AdminDashboard = () => {
  const { user, logout } = useAuth();
  const { projects, addProject, deleteProject } = useProjects();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    startDate: '',
    endDate: '',
  });
  const [managers, setManagers] = useState([]);
  const [selectedManager, setSelectedManager] = useState('');

  useEffect(() => {
    const usersRef = collection(db, 'users');

    const unsubscribe = onSnapshot(
      usersRef,
      snapshot => {
        const managerUsers = snapshot.docs
          .map(docSnap => {
            const data = docSnap.data();
            if (data.role !== 'Manager') {
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

        setManagers(managerUsers);
      },
      error => {
        console.error('Failed to load managers', error);
      }
    );

    return () => unsubscribe();
  }, []);

  const getTimestampDate = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value.toDate === 'function') return value.toDate();
    return new Date(value);
  };

  const formatDate = (value) => {
    const date = getTimestampDate(value);
    if (!date || Number.isNaN(date.getTime())) return '';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const start = formData.startDate ? new Date(formData.startDate) : null;
    const end = formData.endDate ? new Date(formData.endDate) : null;

    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      window.alert('Please provide valid start and end dates.');
      return;
    }

    if (start >= end) {
      window.alert('Start date must be earlier than end date.');
      return;
    }

    addProject({
      ...formData,
      assignedManager: selectedManager,
    });
    setFormData({
      name: '',
      description: '',
      startDate: '',
      endDate: '',
    });
    setSelectedManager('');
    setIsModalOpen(false);
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const getStatusColor = (status) => {
    switch (status.toLowerCase()) {
      case 'active':
        return 'bg-blue-100 text-blue-800';
      case 'in review':
        return 'bg-orange-100 text-orange-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleMarkProjectCompleted = async (projectId) => {
    try {
      const projectRef = doc(db, 'projects', projectId);
      await updateDoc(projectRef, { status: 'Completed', completedAt: serverTimestamp() });
    } catch (error) {
      console.error('Failed to mark project as completed', error);
    }
  };

  const handleDeleteProject = async (projectId) => {
    // extra guard, though this component is only accessible to Admins via routing
    if (user?.role !== 'Admin') {
      console.warn('Unauthorized delete attempt by non-admin user');
      return;
    }

    if (!window.confirm('Are you sure you want to permanently delete this project? This action cannot be undone.')) {
      return;
    }

    try {
      await deleteProject(projectId);
      // simple confirmation message
      window.alert('Project deleted successfully.');
    } catch (error) {
      console.error('Failed to delete project', error);
      window.alert('Error deleting project. See console for details.');
    }
  };

  const activeProjects = projects.filter(project => project.status === 'Active');
  const inReviewProjects = projects.filter(project => project.status === 'In Review');
  const completedProjects = projects.filter(project => project.status === 'Completed');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <nav className="bg-white shadow-sm border-b border-gray-200 px-6 py-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center space-x-3">
          <Shield className="text-blue-600" size={24} />
          <h1 className="text-xl font-bold text-gray-800">Admin Dashboard</h1>
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
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Projects</h2>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={20} />
            <span>Create Project</span>
          </button>
        </div>

        <div className="space-y-10">
          <section>
            <h3 className="text-lg font-bold text-gray-800 mb-4">Active Projects</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {activeProjects.length > 0 ? (
                activeProjects.map((project) => {
                  const manager = managers.find(m => m.id === project.assignedManager);
                  return (
                    <div key={project.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start mb-4 space-x-2">
                        <h4 className="text-base font-bold text-gray-900 line-clamp-1 flex-1">{project.name}</h4>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
                          {project.status}
                        </span>
                        <button
                          title="Delete project"
                          onClick={() => handleDeleteProject(project.id)}
                          className="text-red-500 hover:text-red-700 ml-2 focus:outline-none"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="space-y-2 text-sm text-gray-500">
                        <div className="flex items-center space-x-2">
                          <User size={16} />
                          <span>Manager: {manager?.name || 'Unassigned'}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Calendar size={16} />
                          <span>Deadline: {formatDate(project.endDate)}</span>
                        </div>
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

          <section>
            <h3 className="text-lg font-bold text-gray-800 mb-4">Projects In Review</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {inReviewProjects.length > 0 ? (
                inReviewProjects.map((project) => {
                  const manager = managers.find(m => m.id === project.assignedManager);
                  return (
                    <div key={project.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start mb-4 space-x-2">
                        <h4 className="text-base font-bold text-gray-900 line-clamp-1 flex-1">{project.name}</h4>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
                          {project.status}
                        </span>
                        <button
                          title="Delete project"
                          onClick={() => handleDeleteProject(project.id)}
                          className="text-red-500 hover:text-red-700 ml-2 focus:outline-none"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="space-y-2 text-sm text-gray-500">
                        <div className="flex items-center space-x-2">
                          <User size={16} />
                          <span>Manager: {manager?.name || 'Unassigned'}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Calendar size={16} />
                          <span>Deadline: {formatDate(project.endDate)}</span>
                        </div>
                      </div>
                      <div className="mt-4 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleMarkProjectCompleted(project.id)}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors"
                        >
                          Approve Project
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="col-span-full text-center py-8 bg-white rounded-xl border border-gray-200 border-dashed">
                  <p className="text-gray-500">No projects currently in review.</p>
                </div>
              )}
            </div>
          </section>

          <section>
            <h3 className="text-lg font-bold text-gray-800 mb-4">Completed Projects</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {completedProjects.length > 0 ? (
                completedProjects.map((project) => {
                  const manager = managers.find(m => m.id === project.assignedManager);
                  return (
                    <div key={project.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                      <div className="flex justify-between items-start mb-4 space-x-2">
                        <h4 className="text-base font-bold text-gray-900 line-clamp-1 flex-1">{project.name}</h4>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
                          {project.status}
                        </span>
                        <button
                          title="Delete project"
                          onClick={() => handleDeleteProject(project.id)}
                          className="text-red-500 hover:text-red-700 ml-2 focus:outline-none"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="space-y-2 text-sm text-gray-500">
                        <div className="flex items-center space-x-2">
                          <User size={16} />
                          <span>Manager: {manager?.name || 'Unassigned'}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Activity size={16} />
                          <span>
                            Completed: {project.completedAt ? formatDate(project.completedAt) : formatDate(project.endDate)}
                          </span>
                        </div>
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
        </div>
      </main>

      {/* Create Project Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-900">Create New Project</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Project Name</label>
                <input
                  type="text"
                  name="name"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="e.g. Website Redesign"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  name="description"
                  required
                  value={formData.description}
                  onChange={handleChange}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                  placeholder="Project goals and details..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    name="startDate"
                    required
                    value={formData.startDate}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input
                    type="date"
                    name="endDate"
                    required
                    value={formData.endDate}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assign Manager</label>
                <select
                  required
                  value={selectedManager}
                  onChange={(e) => setSelectedManager(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">Select Manager</option>
                  {managers.map(manager => (
                    <option key={manager.id} value={manager.id}>
                      {manager.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
