import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';

export const wipeProjects = async () => {
  const projectsSnapshot = await getDocs(collection(db, 'projects'));

  for (const projectDoc of projectsSnapshot.docs) {
    const tasksSnapshot = await getDocs(
      collection(db, 'projects', projectDoc.id, 'tasks')
    );

    for (const taskDoc of tasksSnapshot.docs) {
      await deleteDoc(
        doc(db, 'projects', projectDoc.id, 'tasks', taskDoc.id)
      );
    }

    await deleteDoc(doc(db, 'projects', projectDoc.id));
  }

  console.log('All projects and tasks wiped successfully.');
};

