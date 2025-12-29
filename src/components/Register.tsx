import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { saveEmployee, saveOwner } from '../lib/auth';
import { Eye, EyeOff } from 'lucide-react';

interface RegisterProps {
  onSuccess: () => void;
  onOwnerSuccess: () => void;
}

// Cookie helper functions
const setCookie = (name: string, value: string, days: number) => {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
};

const getCookie = (name: string): string | null => {
  const nameEQ = name + '=';
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
};

const deleteCookie = (name: string) => {
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
};

export default function Register({ onSuccess, onOwnerSuccess }: RegisterProps) {
  const [characterName, setCharacterName] = useState('');
  const [discordId, setDiscordId] = useState('');
  const [verificationKey, setVerificationKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [showVerificationKey, setShowVerificationKey] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [savedCredentials, setSavedCredentials] = useState<{
    characterName: string;
    discordId: string;
    verificationKey: string;
  } | null>(null);

  // Security: Prevent inspect mode and unauthorized access
  useEffect(() => {
    // Check for saved credentials
    const savedCreds = getCookie('dragonAutoShopCreds');
    if (savedCreds) {
      try {
        const parsed = JSON.parse(savedCreds);
        setSavedCredentials(parsed);
      } catch (e) {
        console.error('Error parsing saved credentials:', e);
      }
    }

    // Block right-click
    const blockRightClick = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };

    // Block keyboard shortcuts for DevTools
    const blockKeys = (e: KeyboardEvent) => {
      // F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U, Ctrl+Shift+C
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
        (e.ctrlKey && e.key === 'u')
      ) {
        e.preventDefault();
        return false;
      }
    };

    // Detect DevTools
    const detectDevTools = () => {
      const threshold = 160;
      if (
        window.outerWidth - window.innerWidth > threshold ||
        window.outerHeight - window.innerHeight > threshold
      ) {
        // DevTools detected - clear and redirect
        localStorage.clear();
        sessionStorage.clear();
        window.location.reload();
      }
    };

    // Add event listeners
    document.addEventListener('contextmenu', blockRightClick);
    document.addEventListener('keydown', blockKeys);
    const devToolsInterval = setInterval(detectDevTools, 1000);

    // Cleanup
    return () => {
      document.removeEventListener('contextmenu', blockRightClick);
      document.removeEventListener('keydown', blockKeys);
      clearInterval(devToolsInterval);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // First, check if user is owner
      const { data: owner } = await supabase
        .from('owners')
        .select('*')
        .eq('character_name', characterName.toLowerCase())
        .maybeSingle();

      if (owner) {
        // Verify owner credentials
        if (owner.discord_id === discordId && owner.verification_key.toUpperCase() === verificationKey.toUpperCase()) {
          saveOwner(owner);
          
          // Create/Get employee record for owner (for sales tracking)
          const { data: ownerEmployee } = await supabase
            .from('employees')
            .select('*')
            .eq('discord_id', owner.discord_id)
            .maybeSingle();

          if (!ownerEmployee) {
            // Create employee record for owner
            const { data: newOwnerEmployee, error: insertError } = await supabase
              .from('employees')
              .insert({
                character_name: owner.character_name,
                discord_id: owner.discord_id,
                verification_key: owner.verification_key,
              })
              .select()
              .single();

            if (!insertError && newOwnerEmployee) {
              saveEmployee(newOwnerEmployee);
            }
          } else {
            saveEmployee(ownerEmployee);
          }

          setIsOwner(true);
          setShowSavePrompt(true);
        } else {
          setError('Invalid credentials. Please check your Discord USER ID and Verification Key.');
        }
        setLoading(false);
        return;
      }

      // Check if verification key is correct (from environment variable)
      const correctKey = import.meta.env.VITE_VERIFICATION_KEY;
      if (!correctKey || verificationKey.toUpperCase() !== correctKey.toUpperCase()) {
        setError('Invalid Verification Key. Please ask your owner for the correct key.');
        setLoading(false);
        return;
      }

      const { data: existingEmployee, error: selectError } = await supabase
        .from('employees')
        .select('*')
        .eq('character_name', characterName.toLowerCase())
        .maybeSingle();

      if (selectError) {
        console.error('Select error:', selectError);
        setError(`Database error: ${selectError.message}`);
        setLoading(false);
        return;
      }

      if (existingEmployee) {
        // Check if employee is blocked
        if (existingEmployee.is_blocked) {
          setError(`Your account has been blocked. Reason: ${existingEmployee.block_reason || 'No reason provided'}. Please contact the owner.`);
          setLoading(false);
          return;
        }

        // Employee exists - verify Discord ID and verification key
        if (existingEmployee.discord_id === discordId && existingEmployee.verification_key === verificationKey) {
          saveEmployee(existingEmployee);
          setIsOwner(false);
          // Show save credentials prompt for first-time login
          setShowSavePrompt(true);
        } else {
          setError('Invalid credentials. Please check your Discord USER ID.');
        }
      } else {
        // New employee registration
        const { data: newEmployee, error: insertError } = await supabase
          .from('employees')
          .insert({
            character_name: characterName.toLowerCase(),
            discord_id: discordId,
            verification_key: verificationKey.toUpperCase(),
          })
          .select()
          .single();

        if (insertError) {
          console.error('Insert error:', insertError);
          if (insertError.code === '23505') {
            setError('This Discord ID is already registered.');
          } else {
            setError(`Registration failed: ${insertError.message}`);
          }
        } else if (newEmployee) {
          saveEmployee(newEmployee);
          setIsOwner(false);
          // Show save credentials prompt for first-time registration
          setShowSavePrompt(true);
        } else {
          setError('Registration failed. No data returned.');
        }
      }
    } catch (err) {
      console.error('Catch error:', err);
      setError(`An error occurred: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCredentials = (save: boolean) => {
    if (save) {
      const credentials = {
        characterName,
        discordId,
        verificationKey,
      };
      setCookie('dragonAutoShopCreds', JSON.stringify(credentials), 7); // Save for 7 days
    }
    setShowSavePrompt(false);
    if (isOwner) {
      onOwnerSuccess();
    } else {
      onSuccess();
    }
  };

  const handleAutoLogin = async () => {
    if (!savedCredentials) return;

    setCharacterName(savedCredentials.characterName);
    setDiscordId(savedCredentials.discordId);
    setVerificationKey(savedCredentials.verificationKey);
    setError('');
    setLoading(true);

    try {
      // First, check if user is owner
      const { data: owner } = await supabase
        .from('owners')
        .select('*')
        .eq('character_name', savedCredentials.characterName.toLowerCase())
        .maybeSingle();

      if (owner) {
        if (owner.discord_id === savedCredentials.discordId && 
            owner.verification_key.toUpperCase() === savedCredentials.verificationKey.toUpperCase()) {
          saveOwner(owner);
          
          // Create/Get employee record for owner (for sales tracking)
          const { data: ownerEmployee } = await supabase
            .from('employees')
            .select('*')
            .eq('discord_id', owner.discord_id)
            .maybeSingle();

          if (!ownerEmployee) {
            // Create employee record for owner
            const { data: newOwnerEmployee } = await supabase
              .from('employees')
              .insert({
                character_name: owner.character_name,
                discord_id: owner.discord_id,
                verification_key: owner.verification_key,
              })
              .select()
              .single();

            if (newOwnerEmployee) {
              saveEmployee(newOwnerEmployee);
            }
          } else {
            saveEmployee(ownerEmployee);
          }

          onOwnerSuccess();
          setLoading(false);
          return;
        }
      }

      const correctKey = import.meta.env.VITE_VERIFICATION_KEY;
      if (!correctKey || savedCredentials.verificationKey.toUpperCase() !== correctKey.toUpperCase()) {
        setError('Saved credentials are invalid. Please login manually.');
        setLoading(false);
        deleteCookie('dragonAutoShopCreds');
        setSavedCredentials(null);
        return;
      }

      const { data: existingEmployee, error: selectError } = await supabase
        .from('employees')
        .select('*')
        .eq('character_name', savedCredentials.characterName.toLowerCase())
        .maybeSingle();

      if (selectError) {
        console.error('Select error:', selectError);
        setError(`Database error: ${selectError.message}`);
        setLoading(false);
        return;
      }

      if (existingEmployee) {
        // Check if employee is blocked
        if (existingEmployee.is_blocked) {
          setError(`Your account has been blocked. Reason: ${existingEmployee.block_reason || 'No reason provided'}. Please contact the owner.`);
          setLoading(false);
          deleteCookie('dragonAutoShopCreds');
          setSavedCredentials(null);
          return;
        }

        if (existingEmployee.discord_id === savedCredentials.discordId && 
            existingEmployee.verification_key === savedCredentials.verificationKey) {
          saveEmployee(existingEmployee);
          onSuccess();
        } else {
          setError('Saved credentials are invalid. Please login manually.');
          deleteCookie('dragonAutoShopCreds');
          setSavedCredentials(null);
        }
      } else {
        setError('Account not found. Please login manually.');
        deleteCookie('dragonAutoShopCreds');
        setSavedCredentials(null);
      }
    } catch (err) {
      console.error('Auto-login error:', err);
      setError(`An error occurred: ${err instanceof Error ? err.message : 'Unknown error'}`);
      deleteCookie('dragonAutoShopCreds');
      setSavedCredentials(null);
    } finally {
      setLoading(false);
    }
  };

  const handleClearSavedCredentials = () => {
    deleteCookie('dragonAutoShopCreds');
    setSavedCredentials(null);
    setCharacterName('');
    setDiscordId('');
    setVerificationKey('');
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-4 bg-gradient-to-br from-gray-900 via-red-950 to-gray-900">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNnoiIHN0cm9rZT0iIzk5MjIyMiIgc3Ryb2tlLXdpZHRoPSIuNSIgb3BhY2l0eT0iLjIiLz48L2c+PC9zdmc+')] opacity-20"></div>

      <div className="relative w-full max-w-md">
        <div className="absolute transform -translate-x-1/2 -top-20 left-1/2">
          <div className="relative">
            <img src="/logo.png" alt="Dragon Auto Shop Logo" className="w-24 h-24 animate-pulse drop-shadow-[0_0_25px_rgba(218,165,32,0.8)]" />
            <div className="absolute inset-0 bg-yellow-500 opacity-40 blur-2xl animate-pulse"></div>
          </div>
        </div>

        <div className="p-8 border-2 rounded-lg shadow-2xl bg-black/80 backdrop-blur-md border-red-600/50">
          <div className="mb-8 text-center">
            <h1 className="mb-2 text-3xl font-bold text-red-500">DRAGON AUTO SHOP</h1>
            <p className="text-sm text-gray-400">Hydra Roleplay - HRP</p>
            <p className="mt-2 text-xs text-gray-500">Employee Portal</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {savedCredentials && (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleAutoLogin}
                  disabled={loading}
                  className="w-full px-6 py-3 font-bold text-white transition-all transform rounded shadow-lg bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                >
                  {loading ? 'PROCESSING...' : '🔐 AUTO LOGIN'}
                </button>
                <button
                  type="button"
                  onClick={handleClearSavedCredentials}
                  className="w-full px-6 py-3 font-bold text-white transition-all bg-gray-600 rounded hover:bg-gray-700"
                >
                  Clear Saved Credentials
                </button>
              </div>
            )}

            {!savedCredentials && (
              <>
                <div>
                  <label className="block mb-2 text-sm font-semibold text-red-400">
                    Character Name
                  </label>
                  <input
                    type="text"
                    value={characterName}
                    onChange={(e) => {
                      // Only allow letters and spaces (no numbers)
                      const value = e.target.value;
                      if (/^[a-zA-Z\s]*$/.test(value)) {
                        setCharacterName(value);
                      }
                    }}
                    className="w-full px-4 py-3 text-white placeholder-gray-600 transition-all border rounded bg-gray-900/50 border-red-600/30 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                    placeholder="Enter your character name"
                    required
                  />
                </div>

                <div>
                  <label className="block mb-2 text-sm font-semibold text-red-400">
                    Discord USER ID
                  </label>
                  <input
                    type="text"
                    value={discordId}
                    onChange={(e) => {
                      // Only allow numbers
                      const value = e.target.value;
                      if (/^\d*$/.test(value)) {
                        setDiscordId(value);
                      }
                    }}
                    className="w-full px-4 py-3 text-white placeholder-gray-600 transition-all border rounded bg-gray-900/50 border-red-600/30 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                    placeholder="Enter your Discord USER ID"
                    required
                  />
                </div>

                <div>
                  <label className="block mb-2 text-sm font-semibold text-red-400">
                    Verification Key
                  </label>
                  <div className="relative">
                    <input
                      type={showVerificationKey ? "text" : "password"}
                      value={verificationKey}
                      onChange={(e) => {
                        // Only allow letters (no numbers)
                        const value = e.target.value;
                        if (/^[a-zA-Z]*$/.test(value)) {
                          setVerificationKey(value);
                        }
                      }}
                      className="w-full px-4 py-3 pr-12 text-white placeholder-gray-600 transition-all border rounded bg-gray-900/50 border-red-600/30 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                      placeholder="Enter verification key"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowVerificationKey(!showVerificationKey)}
                      className="absolute text-gray-400 transition-colors transform -translate-y-1/2 right-3 top-1/2 hover:text-red-400"
                      tabIndex={-1}
                    >
                      {showVerificationKey ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="px-4 py-3 text-sm text-red-300 border rounded bg-red-900/30 border-red-500/50">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full px-6 py-3 font-bold text-white transition-all transform rounded shadow-lg bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                >
                  {loading ? 'PROCESSING...' : 'ACCESS PORTAL'}
                </button>
              </>
            )}
          </form>
        </div>
      </div>

      {/* Save Credentials Popup */}
      {showSavePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md p-8 border-2 rounded-lg shadow-2xl bg-gradient-to-br from-gray-900 via-red-950 to-gray-900 border-red-600/50">
            <div className="mb-6 text-center">
              <div className="flex justify-center mb-4">
                <div className="p-4 rounded-full bg-red-600/20">
                  <img src="/logo.png" alt="Dragon Logo" className="w-12 h-12" />
                </div>
              </div>
              <h2 className="mb-2 text-2xl font-bold text-red-500">Save Credentials?</h2>
              <p className="text-sm text-gray-400">
                Would you like to save your credentials for future use?
              </p>
              <p className="mt-2 text-xs text-gray-500">
                Your credentials will be saved securely for 1 week.
              </p>
            </div>
            
            <div className="flex gap-4">
              <button
                onClick={() => handleSaveCredentials(false)}
                className="flex-1 px-6 py-3 font-bold text-white transition-all bg-gray-600 rounded hover:bg-gray-700"
              >
                NO, THANKS
              </button>
              <button
                onClick={() => handleSaveCredentials(true)}
                className="flex-1 px-6 py-3 font-bold text-white transition-all transform rounded shadow-lg bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 hover:scale-105"
              >
                YES, SAVE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
