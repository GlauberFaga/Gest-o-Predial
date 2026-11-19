import { createContext, useContext, useEffect, useState, useMemo, ReactNode } from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signOut,
} from 'firebase/auth';
import {
  doc,
  setDoc,
  onSnapshot,
  collection,
  query,
  where,
  documentId,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType, testConnection } from '../lib/firebase';
import { User, Role, Company } from '../types';

interface AuthContextType {
  currentUser: FirebaseUser | null;
  userData: User | null;
  companies: Company[];
  activeCompany: Company | null;
  setActiveCompanyId: (companyId: string) => void;
  loading: boolean;
  ssoError: string | null;
  dbConnected: boolean | null;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({
  children,
  initialSsoError = null,
}: {
  children: ReactNode;
  initialSsoError?: string | null;
}) {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userData, setUserData] = useState<User | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [ssoError] = useState<string | null>(initialSsoError);
  const [dbConnected, setDbConnected] = useState<boolean | null>(null);

  useEffect(() => {
    void testConnection().then((ok) => setDbConnected(ok));
  }, []);

  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | undefined;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);

      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = undefined;
      }

      if (user) {
        setLoading(true);
        const storedCompanyId = localStorage.getItem(`activeCompany_${user.uid}`) || '';
        setSelectedCompanyId(storedCompanyId);

        const userDocRef = doc(db, 'users', user.uid);
        let settled = false;

        const timeoutId = setTimeout(() => {
          if (!settled) {
            console.warn('Auth timeout: onSnapshot took too long. Falling back to default.');
            setUserData({
              id: user.uid,
              email: user.email || '',
              role: user.email === 'glauber.faga@gmail.com' ? 'master' : 'requester',
              name: user.displayName || user.email?.split('@')[0] || 'Usuário',
              companyIds: [],
              active: true,
              createdAt: new Date(),
            });
            setLoading(false);
          }
        }, 5000);

        try {
          unsubscribeSnapshot = onSnapshot(
            userDocRef,
            async (docSnap) => {
              settled = true;
              clearTimeout(timeoutId);
              if (docSnap.exists()) {
                const data = docSnap.data();
                setUserData({
                  id: user.uid,
                  email: user.email || data.email || '',
                  role: data.role as Role,
                  name: data.name || '',
                  companyIds: Array.isArray(data.companyIds) ? data.companyIds : [],
                  active: data.active ?? true,
                  createdAt: data.createdAt?.toDate() || new Date(),
                });
                setLoading(false);
              } else {
                const defaultRole: Role =
                  user.email === 'glauber.faga@gmail.com' ? 'master' : 'requester';
                const newUserData: User = {
                  id: user.uid,
                  email: user.email || '',
                  role: defaultRole,
                  name: user.displayName || user.email?.split('@')[0] || 'Usuário',
                  companyIds: [],
                  active: true,
                  createdAt: new Date(),
                };

                setUserData(newUserData);
                setLoading(false);

                try {
                  await setDoc(userDocRef, {
                    id: newUserData.id,
                    email: newUserData.email,
                    role: newUserData.role,
                    name: newUserData.name,
                    companyIds: [],
                    active: true,
                    createdAt: new Date(),
                  });
                } catch (e) {
                  handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}`);
                }
              }
            },
            (err) => {
              settled = true;
              clearTimeout(timeoutId);
              handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
              setUserData({
                id: user.uid,
                email: user.email || '',
                role: user.email === 'glauber.faga@gmail.com' ? 'master' : 'requester',
                name: user.displayName || user.email?.split('@')[0] || 'Usuário',
                companyIds: [],
                active: true,
                createdAt: new Date(),
              });
              setLoading(false);
            }
          );
        } catch (error) {
          settled = true;
          clearTimeout(timeoutId);
          handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
          setUserData({
            id: user.uid,
            email: user.email || '',
            role: user.email === 'glauber.faga@gmail.com' ? 'master' : 'requester',
            name: user.displayName || user.email?.split('@')[0] || 'Usuário',
            companyIds: [],
            active: true,
            createdAt: new Date(),
          });
          setLoading(false);
        }
      } else {
        setUserData(null);
        setCompanies([]);
        setSelectedCompanyId('');
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
      }
    };
  }, []);

  // Listen to accessible companies based on user role & companyIds
  useEffect(() => {
    if (!currentUser || !userData || userData.active === false) {
      setCompanies([]);
      return;
    }

    if (userData.role === 'master') {
      const q = query(collection(db, 'companies'));
      const unsub = onSnapshot(
        q,
        (snapshot) => {
          const list = snapshot.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              name: data.name || '',
              cnpj: data.cnpj || '',
              email: data.email || '',
              phone: data.phone || '',
              active: data.active ?? true,
              createdBy: data.createdBy || '',
              createdAt: data.createdAt?.toDate() || new Date(),
            } as Company;
          });
          list.sort((a, b) => a.name.localeCompare(b.name));
          setCompanies(list);
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, 'companies');
        }
      );
      return unsub;
    }

    const ids = userData.companyIds || [];
    if (ids.length === 0) {
      setCompanies([]);
      return;
    }

    // Firestore 'in' supports up to 30 IDs per query
    const chunk = ids.slice(0, 30);
    const q = query(collection(db, 'companies'), where(documentId(), 'in', chunk));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              name: data.name || '',
              cnpj: data.cnpj || '',
              email: data.email || '',
              phone: data.phone || '',
              active: data.active ?? true,
              createdBy: data.createdBy || '',
              createdAt: data.createdAt?.toDate() || new Date(),
            } as Company;
          })
          .filter((c) => c.active !== false);
        list.sort((a, b) => a.name.localeCompare(b.name));
        setCompanies(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'companies');
      }
    );
    return unsub;
  }, [currentUser?.uid, userData?.role, JSON.stringify(userData?.companyIds || []), userData?.active]);

  const activeCompany = useMemo(() => {
    if (companies.length === 0) return null;
    const found = companies.find((c) => c.id === selectedCompanyId);
    if (found && (userData?.role === 'master' || found.active !== false)) {
      return found;
    }
    return companies.find((c) => c.active !== false) || companies[0] || null;
  }, [companies, selectedCompanyId, userData?.role]);

  const setActiveCompanyId = (companyId: string) => {
    setSelectedCompanyId(companyId);
    if (currentUser) {
      localStorage.setItem(`activeCompany_${currentUser.uid}`, companyId);
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userData,
        companies,
        activeCompany,
        setActiveCompanyId,
        loading,
        ssoError,
        dbConnected,
        logout,
      }}
    >
      {loading ? (
        <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center gap-4 text-neutral-300">
          <div className="h-9 w-9 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin" />
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
