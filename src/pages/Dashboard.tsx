import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store/auth';
import { supabase } from '../lib/supabase';
import { formatDate } from '../lib/utils';
import { Calendar, Clock, FileText, Check, X, UserPlus } from 'lucide-react';

interface Professor {
  id: string;
  full_name: string;
}

interface Session {
  id: string;
  start_time: string;
  end_time: string;
  professor: {
    full_name: string;
  };
}

interface Request {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  student_file_url: string | null;
  professor_file_url: string | null;
  professor: {
    full_name: string;
  };
  student: {
    full_name: string;
  };
  session: {
    start_time: string;
    end_time: string;
  };
}

export default function Dashboard() {
  const { user } = useAuthStore();
  const [professors, setProfessors] = useState<Professor[]>([]);
  const [selectedProfessor, setSelectedProfessor] = useState<string>('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [newSession, setNewSession] = useState({
    startTime: '',
    endTime: '',
    academicYear: new Date().getMonth() >= 8 ? 
      new Date().getFullYear().toString() : 
      (new Date().getFullYear() - 1).toString()
  });

  useEffect(() => {
    fetchData();
  }, [user]);

  useEffect(() => {
    if (selectedProfessor) {
      fetchProfessorSessions(selectedProfessor);
    } else {
      setSessions([]);
      setSelectedSession('');
    }
  }, [selectedProfessor]);

  const handleFileClick = async (url: string, event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    
    try {
      const response = await fetch(url);
      const contentType = response.headers.get('content-type');
      
      if (contentType?.includes('text/')) {
        const text = await response.text();
        const newWindow = window.open('');
        if (newWindow) {
          newWindow.document.write(`
            <html>
              <head>
                <title>File Content</title>
                <style>
                  body {
                    font-family: monospace;
                    white-space: pre-wrap;
                    padding: 20px;
                    margin: 0;
                    background: #f5f5f5;
                  }
                  pre {
                    background: white;
                    padding: 20px;
                    border-radius: 8px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                  }
                </style>
              </head>
              <body>
                <pre>${text}</pre>
              </body>
            </html>
          `);
        }
      } else {
        window.open(url, '_blank');
      }
    } catch (error) {
      console.error('Error handling file:', error);
      alert('Error opening file. Please try again.');
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);

      if (user?.user_type === 'professor') {
        const { data: professorSessions } = await supabase
          .from('registration_sessions')
          .select(`
            id,
            start_time,
            end_time,
            professor:profiles(full_name)
          `)
          .eq('professor_id', user.id)
          .order('start_time', { ascending: true });

        setSessions(professorSessions || []);
      } else {
        const { data: allProfessors } = await supabase
          .from('profiles')
          .select('id, full_name')
          .eq('user_type', 'professor')
          .order('full_name');

        setProfessors(allProfessors || []);
      }

      const { data: coordinationRequests } = await supabase
        .from('coordination_requests')
        .select(`
          id,
          status,
          rejection_reason,
          student_file_url,
          professor_file_url,
          professor:profiles!professor_id(full_name),
          student:profiles!student_id(full_name),
          session:registration_sessions(start_time, end_time)
        `)
        .or(
          user?.user_type === 'student'
            ? `student_id.eq.${user.id}`
            : `professor_id.eq.${user.id}`
        )
        .order('created_at', { ascending: false });

      setRequests(coordinationRequests || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProfessorSessions = async (professorId: string) => {
    const { data } = await supabase
      .from('registration_sessions')
      .select(`
        id,
        start_time,
        end_time,
        professor:profiles(full_name)
      `)
      .eq('professor_id', professorId)
      .gte('start_time', new Date().toISOString())
      .order('start_time', { ascending: true });

    setSessions(data || []);
    setSelectedSession('');
  };

  const handleCreateRequest = async () => {
    try {
      setActionLoading('create');
      
      const { error } = await supabase
        .from('coordination_requests')
        .insert([
          {
            student_id: user?.id,
            professor_id: selectedProfessor,
            session_id: selectedSession,
            status: 'pending'
          }
        ]);

      if (error) throw error;

      setSelectedProfessor('');
      setSelectedSession('');
      await fetchData();
    } catch (error) {
      console.error('Error creating request:', error);
      alert('Error creating request. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateSession = async () => {
    try {
      setActionLoading('create-session');
      
      const { error } = await supabase
        .from('registration_sessions')
        .insert([
          {
            professor_id: user?.id,
            start_time: newSession.startTime,
            end_time: newSession.endTime,
            academic_year: newSession.academicYear
          }
        ]);

      if (error) throw error;

      setNewSession({
        startTime: '',
        endTime: '',
        academicYear: new Date().getMonth() >= 8 ? 
          new Date().getFullYear().toString() : 
          (new Date().getFullYear() - 1).toString()
      });
      await fetchData();
    } catch (error) {
      console.error('Error creating session:', error);
      alert('Error creating session. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleFileUpload = async (requestId: string, file: File) => {
    try {
      setActionLoading(requestId);
      const fileExt = file.name.split('.').pop();
      const fileName = `${user?.id}/${requestId}/${Math.random()}.${fileExt}`;
      
      const { error: uploadError, data } = await supabase.storage
        .from('dissertation-files')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: publicUrl } = supabase.storage
        .from('dissertation-files')
        .getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from('coordination_requests')
        .update({
          [user?.user_type === 'student' ? 'student_file_url' : 'professor_file_url']: publicUrl.publicUrl
        })
        .eq('id', requestId);

      if (updateError) throw updateError;

      await fetchData();
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Error uploading file. Please try again.');
    } finally {
      setActionLoading(null);
      setSelectedFile(null);
    }
  };

  const handleRequestAction = async (requestId: string, action: 'approve' | 'reject') => {
    try {
      setActionLoading(requestId);

      if (action === 'reject' && !rejectionReason) {
        alert('Please provide a reason for rejection');
        return;
      }

      const { error } = await supabase
        .from('coordination_requests')
        .update({
          status: action === 'approve' ? 'approved' : 'rejected',
          rejection_reason: action === 'reject' ? rejectionReason : null
        })
        .eq('id', requestId);

      if (error) throw error;

      setRejectionReason('');
      await fetchData();
    } catch (error) {
      console.error('Error updating request:', error);
      alert('Error updating request. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {user?.user_type === 'professor' && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Create Registration Session</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="startTime" className="block text-sm font-medium text-gray-700">
                  Start Time
                </label>
                <input
                  type="datetime-local"
                  id="startTime"
                  value={newSession.startTime}
                  onChange={(e) => setNewSession(prev => ({ ...prev, startTime: e.target.value }))}
                  className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                />
              </div>
              <div>
                <label htmlFor="endTime" className="block text-sm font-medium text-gray-700">
                  End Time
                </label>
                <input
                  type="datetime-local"
                  id="endTime"
                  value={newSession.endTime}
                  onChange={(e) => setNewSession(prev => ({ ...prev, endTime: e.target.value }))}
                  className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                />
              </div>
            </div>
            <div>
              <label htmlFor="academicYear" className="block text-sm font-medium text-gray-700">
                Academic Year
              </label>
              <input
                type="text"
                id="academicYear"
                value={newSession.academicYear}
                onChange={(e) => setNewSession(prev => ({ ...prev, academicYear: e.target.value }))}
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                placeholder="YYYY"
              />
            </div>
            <button
              onClick={handleCreateSession}
              disabled={!newSession.startTime || !newSession.endTime || !newSession.academicYear || !!actionLoading}
              className="w-full flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              <Calendar className="h-4 w-4 mr-2" />
              Create Session
            </button>
          </div>
        </div>
      )}

      {user?.user_type === 'student' && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Request Coordination</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="professor" className="block text-sm font-medium text-gray-700">
                Select Professor
              </label>
              <select
                id="professor"
                value={selectedProfessor}
                onChange={(e) => setSelectedProfessor(e.target.value)}
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
              >
                <option value="">Select a professor</option>
                {professors.map((professor) => (
                  <option key={professor.id} value={professor.id}>
                    {professor.full_name}
                  </option>
                ))}
              </select>
            </div>

            {selectedProfessor && (
              <div>
                <label htmlFor="session" className="block text-sm font-medium text-gray-700">
                  Select Session
                </label>
                <select
                  id="session"
                  value={selectedSession}
                  onChange={(e) => setSelectedSession(e.target.value)}
                  className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                >
                  <option value="">Select a session</option>
                  {sessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {formatDate(session.start_time)} - {formatDate(session.end_time)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedSession && (
              <button
                onClick={handleCreateRequest}
                disabled={!selectedSession || !!actionLoading}
                className="w-full flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Request Coordination
              </button>
            )}
          </div>
        </div>
      )}

      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
          {user?.user_type === 'professor' ? 'Coordination Requests' : 'Your Requests'}
        </h2>
        
        <div className="space-y-4">
          {requests.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No requests found.</p>
          ) : (
            requests.map((request) => (
              <div
                key={request.id}
                className="border rounded-lg p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <FileText className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="font-medium text-gray-900">
                        {user?.user_type === 'professor'
                          ? request.student.full_name
                          : request.professor.full_name}
                      </p>
                      <p className="text-sm text-gray-500">
                        Session: {formatDate(request.session.start_time)}
                      </p>
                    </div>
                  </div>
                  <div className={`
                    px-3 py-1 rounded-full text-sm font-medium
                    ${request.status === 'approved' ? 'bg-green-100 text-green-800' : ''}
                    ${request.status === 'rejected' ? 'bg-red-100 text-red-800' : ''}
                    ${request.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : ''}
                  `}>
                    {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                  </div>
                </div>

                {request.rejection_reason && (
                  <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-600">
                    Rejection reason: {request.rejection_reason}
                  </div>
                )}

                {user?.user_type === 'professor' && request.status === 'pending' && (
                  <div className="flex items-center space-x-4 pt-2">
                    <button
                      onClick={() => handleRequestAction(request.id, 'approve')}
                      disabled={!!actionLoading}
                      className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                    >
                      <Check className="h-4 w-4 mr-2" />
                      Approve
                    </button>
                    <div className="flex-1 flex items-center space-x-2">
                      <input
                        type="text"
                        placeholder="Reason for rejection"
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      />
                      <button
                        onClick={() => handleRequestAction(request.id, 'reject')}
                        disabled={!!actionLoading}
                        className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Reject
                      </button>
                    </div>
                  </div>
                )}

                {request.status === 'approved' && (
                  <div className="border-t pt-3 mt-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <input
                          type="file"
                          onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                        />
                      </div>
                      <button
                        onClick={() => selectedFile && handleFileUpload(request.id, selectedFile)}
                        disabled={!selectedFile || !!actionLoading}
                        className="ml-3 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                      >
                        Upload File
                      </button>
                    </div>

                    <div className="flex items-center space-x-4">
                      {request.student_file_url && (
                        <a
                          href={request.student_file_url}
                          onClick={(e) => handleFileClick(request.student_file_url!, e)}
                          className="inline-flex items-center text-sm text-indigo-600 hover:text-indigo-500"
                        >
                          <FileText className="h-4 w-4 mr-1" />
                          Student File
                        </a>
                      )}
                      
                      {request.professor_file_url && (
                        <a
                          href={request.professor_file_url}
                          onClick={(e) => handleFileClick(request.professor_file_url!, e)}
                          className="inline-flex items-center text-sm text-indigo-600 hover:text-indigo-500"
                        >
                          <FileText className="h-4 w-4 mr-1" />
                          Professor File
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}