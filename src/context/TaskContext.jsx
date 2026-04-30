import React, { createContext, useContext } from 'react';
import { db } from '../firebase';
import { collection, addDoc, doc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';

const TaskContext = createContext(undefined);

export const TaskProvider = ({ children }) => {
  // we no longer keep a global tasks list; project and user components query directly

  const addTask = async (taskData) => {
    // only write to project subcollection; global collection is no longer used
    const taskRef = collection(db, 'projects', taskData.projectId, 'tasks');
    const now = new Date();

    await addDoc(taskRef, {
      projectId: taskData.projectId,
      title: taskData.title,
      description: taskData.description,
      assignedTo: taskData.assignedTo,
      status: taskData.status || 'To Do',
      priority: taskData.priority,
      deadline: taskData.deadline,
      createdAt: serverTimestamp(),
      comments: [],
      activityLog: [
        {
          id: Math.random().toString(36).substr(2, 9),
          action: 'Task created',
          user: taskData.assignedByName || 'System',
          timestamp: now,
        },
      ],
    });
  };

  const updateTaskStatus = async (projectId, taskId, newStatus, userName) => {
    // update only within the project subcollection
    const taskRef = doc(db, 'projects', projectId, 'tasks', taskId);
    const now = new Date();

    const activityEntry = {
      id: Math.random().toString(36).substr(2, 9),
      action: `Status changed to ${newStatus}`,
      user: userName,
      timestamp: now,
    };

    const updateData = {
      status: newStatus,
      activityLog: arrayUnion(activityEntry),
    };

    if (newStatus === 'Completed') {
      updateData.completedAt = serverTimestamp();
    }

    await updateDoc(taskRef, updateData);
  };

  const addComment = async (projectId, taskId, comment, userName, currentStatus) => {
    const taskRef = doc(db, 'projects', projectId, 'tasks', taskId);
    const now = new Date();

    const commentEntry = {
      id: Math.random().toString(36).substr(2, 9),
      text: comment,
      user: userName,
      timestamp: now,
    };

    const activityEntry = {
      id: Math.random().toString(36).substr(2, 9),
      action: 'Comment added',
      user: userName,
      timestamp: now,
    };

    const updates = {
      comments: arrayUnion(commentEntry),
      activityLog: arrayUnion(activityEntry),
    };

    if (currentStatus === 'Completed') {
      updates.completionComment = comment;
    }

    await updateDoc(taskRef, updates);
  };


  return (
    <TaskContext.Provider value={{ addTask, updateTaskStatus, addComment }}>
      {children}
    </TaskContext.Provider>
  );
};

export const useTasks = () => {
  const context = useContext(TaskContext);
  if (context === undefined) {
    throw new Error('useTasks must be used within a TaskProvider');
  }
  return context;
};
