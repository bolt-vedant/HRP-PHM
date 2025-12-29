import { useState, useEffect } from 'react';
import { getEmployee, getOwner, getUserType } from './lib/auth';
import Register from './components/Register';
import Dashboard from './components/Dashboard';
import OwnerDashboard from './components/OwnerDashboard';
import SalesForm, { SalesData } from './components/SalesForm';
import BillSummary from './components/BillSummary';
import Snowfall from 'react-snowfall';

type Screen = 'register' | 'dashboard' | 'owner-dashboard' | 'sales' | 'bill';

function App() {
  const [screen, setScreen] = useState<Screen>('register');
  const [salesData, setSalesData] = useState<SalesData | null>(null);

  useEffect(() => {
    const userType = getUserType();
    if (userType === 'owner') {
      const owner = getOwner();
      if (owner) {
        setScreen('owner-dashboard');
      } else {
        setScreen('register');
      }
    } else if (userType === 'employee') {
      const employee = getEmployee();
      if (employee) {
        setScreen('dashboard');
      } else {
        setScreen('register');
      }
    } else {
      setScreen('register');
    }
  }, []);

  // Security: Prevent unauthorized access to protected screens
  useEffect(() => {
    const userType = getUserType();
    if (!userType && screen !== 'register') {
      setScreen('register');
    }
  }, [screen]);

  const handleRegisterSuccess = () => {
    const employee = getEmployee();
    if (employee) {
      setScreen('dashboard');
    }
  };

  const handleOwnerRegisterSuccess = () => {
    const owner = getOwner();
    if (owner) {
      setScreen('owner-dashboard');
    }
  };

  const handleNewSale = () => {
    const userType = getUserType();
    if (!userType) {
      setScreen('register');
      return;
    }
    setSalesData(null);
    setScreen('sales');
  };

  const handleSalesNext = (data: SalesData) => {
    const userType = getUserType();
    if (!userType) {
      setScreen('register');
      return;
    }
    setSalesData(data);
    setScreen('bill');
  };

  const handleBillComplete = () => {
    const userType = getUserType();
    if (userType === 'owner') {
      setScreen('owner-dashboard');
    } else if (userType === 'employee') {
      setScreen('dashboard');
    } else {
      setScreen('register');
    }
  };

  const handleBackToDashboard = () => {
    const userType = getUserType();
    if (userType === 'owner') {
      setSalesData(null);
      setScreen('owner-dashboard');
    } else if (userType === 'employee') {
      setSalesData(null);
      setScreen('dashboard');
    } else {
      setScreen('register');
    }
  };

  const handleLogout = () => {
    setScreen('register');
  };

  return (
    <>
      <Snowfall />
      {screen === 'register' && <Register onSuccess={handleRegisterSuccess} onOwnerSuccess={handleOwnerRegisterSuccess} />}
      {screen === 'dashboard' && <Dashboard onNewSale={handleNewSale} onLogout={handleLogout} />}
      {screen === 'owner-dashboard' && <OwnerDashboard onNewSale={handleNewSale} onLogout={handleLogout} />}
      {screen === 'sales' && <SalesForm onNext={handleSalesNext} onBack={handleBackToDashboard} onDashboard={handleBackToDashboard} initialData={salesData} />}
      {screen === 'bill' && salesData && (
        <BillSummary salesData={salesData} onBack={() => setScreen('sales')} onComplete={handleBillComplete} onDashboard={handleBackToDashboard} />
      )}
    </>
  );
}

export default App;
