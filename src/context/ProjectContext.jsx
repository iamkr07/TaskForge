import React, { createContext, useContext, useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, addDoc, doc, updateDoc, onSnapshot, serverTimestamp, getDocs, deleteDoc } from 'firebase/firestore';

const ProjectContext = createContext(undefined);

export const ProjectProvider = ({ children }) => {
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    const projectsRef = collection(db, 'projects');

    const unsubscribe = onSnapshot(
      projectsRef,
      snapshot => {
        const liveProjects = snapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setProjects(liveProjects);
      },
      error => {
        console.error('Realtime projects listener error', error);
      }
    );

    return () => unsubscribe();
  }, []);

  const addProject = async (projectData) => {
    const projectsRef = collection(db, 'projects');
    await addDoc(projectsRef, {
      name: projectData.name,
      description: projectData.description,
      startDate: projectData.startDate,
      endDate: projectData.endDate,
      status: 'Active',
      createdAt: serverTimestamp(),
      assignedManager: projectData.assignedManager || null,
    });
  };

  const updateProjectStatus = async (projectId, newStatus) => {
    const projectRef = doc(db, 'projects', projectId);
    await updateDoc(projectRef, { status: newStatus });
  };

  // remove a project and all of its task documents
  const deleteProject = async (projectId) => {
    // delete tasks subcollection first to avoid orphan documents showing up in collectionGroup
    const tasksRef = collection(db, 'projects', projectId, 'tasks');
    const tasksSnap = await getDocs(tasksRef);
    for (const taskDoc of tasksSnap.docs) {
      await deleteDoc(doc(db, 'projects', projectId, 'tasks', taskDoc.id));
    }
    // finally delete the project document itself
    await deleteDoc(doc(db, 'projects', projectId));
  };

  return (
    <ProjectContext.Provider value={{ projects, addProject, updateProjectStatus, deleteProject }}>
      {children}
    </ProjectContext.Provider>
  );
};

export const useProjects = () => {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProjects must be used within a ProjectProvider');
  }
  return context;
};
