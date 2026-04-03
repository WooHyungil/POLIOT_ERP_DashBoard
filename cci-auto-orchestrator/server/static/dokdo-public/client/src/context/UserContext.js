import axios from 'axios';
import { createContext, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export const UserContext = createContext(null);

const SESSION_KEY = 'dokdo_session_id';
const USER_KEY_PREFIX = 'dokdo_user_';

const createDefaultUser = (sid) => ({
  sessionId: sid,
  inventory: [],
  stages: Array.from({ length: 6 }, (_, idx) => ({
    stageId: idx + 1,
    cleared: false,
    remainingHearts: 3,
  })),
});

const getUserStorageKey = (sid) => `${USER_KEY_PREFIX}${sid}`;

const loadMockUser = (sid) => {
  if (!sid) return null;
  try {
    const raw = localStorage.getItem(getUserStorageKey(sid));
    if (!raw) return createDefaultUser(sid);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return createDefaultUser(sid);
    if (!Array.isArray(parsed.stages) || parsed.stages.length < 6) {
      parsed.stages = createDefaultUser(sid).stages;
    }
    if (!Array.isArray(parsed.inventory)) {
      parsed.inventory = [];
    }
    parsed.sessionId = sid;
    return parsed;
  } catch (_) {
    return createDefaultUser(sid);
  }
};

const saveMockUser = (userObj) => {
  if (!userObj || !userObj.sessionId) return;
  localStorage.setItem(getUserStorageKey(userObj.sessionId), JSON.stringify(userObj));
};

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [sessionId, setSessionId] = useState(() => sessionStorage.getItem(SESSION_KEY));
  const [hearts, setHearts] = useState(3);
  const apiUrl = String(process.env.REACT_APP_API_URL || '').trim();
  const useMock = !apiUrl;
  const navigate = useNavigate();

  useEffect(() => {
    if (!useMock || !sessionId) return;
    const current = loadMockUser(sessionId);
    if (current) {
      setUser(current);
      setHearts(Number(current?.stages?.[0]?.remainingHearts || 3));
      saveMockUser(current);
    }
  }, [sessionId, useMock]);

  /* 유저 정보 가져오기 */
  const fetchUser = async () => {
    if (useMock) {
      const sid = sessionId || sessionStorage.getItem(SESSION_KEY);
      if (!sid) return null;
      const current = loadMockUser(sid);
      if (current) {
        setUser(current);
        saveMockUser(current);
      }
      return current;
    }
    try {
      const response = await axios.get(`${apiUrl}/session/status?sessionId=${sessionId}`, {
        withCredentials: true,
      });

      if (response.data) {
        setUser(response.data);
        return response.data;
      } else {
        console.log('유저 데이터가 없습니다.');
        return null;
      }
    } catch (error) {
      console.log('유저 정보 GET API 에러', error);
    }
  };

  /* Session 생성 함수 */
  const createSession = async () => {
    if (useMock) {
      const sid = `local-${Date.now()}`;
      sessionStorage.setItem(SESSION_KEY, sid);
      setSessionId(sid);
      const current = createDefaultUser(sid);
      saveMockUser(current);
      setUser(current);
      setHearts(3);
      return { sessionId: sid };
    }
    try {
      const response = await axios.post(`${apiUrl}/session/start`, null, {
        withCredentials: true /* 쿠키를 저장하기 위해 추가 */,
      });

      const newSessionId = response.data.sessionId;

      if (newSessionId) {
        setSessionId(newSessionId);
        navigate('/stage1');
      } else {
        console.log('세션 ID를 쿠키에서 가져오지 못했습니다.');
      }
    } catch (error) {
      console.log('사용자 세션 생성 요청 실패', error);
    }
  };

  /* Stage Clear 함수 */
  const stageClear = async (stageId) => {
    if (useMock) {
      const sid = sessionId || sessionStorage.getItem(SESSION_KEY);
      const current = loadMockUser(sid);
      if (!current) return null;
      const idx = Math.max(0, Number(stageId) - 1);
      if (!current.stages[idx]) {
        current.stages[idx] = { stageId: Number(stageId), cleared: true, remainingHearts: 3 };
      }
      current.stages[idx].cleared = true;
      current.stages[idx].remainingHearts = Math.max(1, Number(current.stages[idx].remainingHearts || 3));
      saveMockUser(current);
      setUser(current);
      return current.stages;
    }
    try {
      const response = await axios.post(`${apiUrl}/stage/${stageId}/clear?sessionId=${sessionId}`, null, {
        withCredentials: true,
      });

      const clearedStage = response.data.stages;
      return clearedStage;
    } catch (error) {
      console.log('Stage Clear POST 요청 실패', error);
    }
  };

  /* 미션 클리어 여부 확인 함수 */
  const missionClear = async ({ stageId, itemName }) => {
    if (useMock) {
      const sid = sessionId || sessionStorage.getItem(SESSION_KEY);
      const current = loadMockUser(sid);
      if (!current) return { cleared: false, remainingHearts: 0 };
      const idx = Math.max(0, Number(stageId) - 1);
      if (!current.stages[idx]) {
        current.stages[idx] = { stageId: Number(stageId), cleared: false, remainingHearts: 3 };
      }
      const stage = current.stages[idx];
      const isCorrect = String(itemName || '').toLowerCase().includes('correct');
      if (isCorrect) {
        stage.cleared = true;
      } else {
        stage.remainingHearts = Math.max(0, Number(stage.remainingHearts || 3) - 1);
      }
      saveMockUser(current);
      setUser(current);
      setHearts(Number(stage.remainingHearts || 0));
      return {
        cleared: !!stage.cleared,
        remainingHearts: Number(stage.remainingHearts || 0),
      };
    }
    try {
      const response = await axios.post(
        `${apiUrl}/stage/${stageId}/attempt?sessionId=${sessionId}&itemName=${itemName}`,
        null,
        {
          withCredentials: true,
        }
      );

      const clearedStage = response.data;
      return clearedStage;
    } catch (error) {
      console.log('Mission Clear POST 요청 실패', error);
    }
  };

  /* 하트 개수 확인 함수 */
  const getHearts = async (stageId) => {
    if (useMock) {
      const sid = sessionId || sessionStorage.getItem(SESSION_KEY);
      const current = loadMockUser(sid);
      if (!current) return 3;
      const idx = Math.max(0, Number(stageId) - 1);
      const remainingHearts = Number(current?.stages?.[idx]?.remainingHearts || 3);
      setHearts(remainingHearts);
      return remainingHearts;
    }
    try {
      const response = await axios.get(`${apiUrl}/stage/${stageId}/status?sessionId=${sessionId}`, null, {
        withCredentials: true,
      });

      if (response.data.remainingHearts) {
        const remainingHearts = response.data.remainingHearts;
        setHearts(remainingHearts);
      }

      return hearts;
    } catch (error) {
      console.log('Stage Clear POST 요청 실패', error);
    }
  };

  const reset = async () => {
    if (useMock) {
      const sid = sessionId || sessionStorage.getItem(SESSION_KEY);
      if (sid) {
        const current = createDefaultUser(sid);
        saveMockUser(current);
        setUser(current);
        setHearts(3);
      }
      return;
    }
    try {
      const response = await axios.delete(`${apiUrl}/stage/reset/${sessionId}`, null, {
        withCredentials: true,
      });

      const reset = response.data.message;
      console.log(reset);
    } catch (error) {
      console.log('Reset POST 요청 실패', error);
    }
  };

  return (
    <UserContext.Provider
      value={{ user, setUser, fetchUser, createSession, stageClear, missionClear, getHearts, hearts, reset }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);

  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }

  return context;
};
