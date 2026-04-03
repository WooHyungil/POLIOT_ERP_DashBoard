import React, { createContext, useContext } from 'react';
import axios from 'axios';

const InventoryContext2 = createContext();
const USER_KEY_PREFIX = 'dokdo_user_';

const itemNameById = {
  1: 'dokdoPuzzle1',
  2: 'dokdoPuzzle2',
  3: 'dokdoPuzzle3',
  4: 'dokdoPuzzle4',
  5: 'taegeukKey',
  6: 'map',
  7: 'timeLocationHint',
  8: 'gunHint',
  9: 'japaneseInfo',
};

const getUserStorageKey = (sid) => `${USER_KEY_PREFIX}${sid}`;

const loadMockUser = (sid) => {
  if (!sid) return null;
  try {
    const raw = localStorage.getItem(getUserStorageKey(sid));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
};

const saveMockUser = (sid, userObj) => {
  if (!sid || !userObj) return;
  localStorage.setItem(getUserStorageKey(sid), JSON.stringify(userObj));
};

export const InventoryProvider2 = ({ children }) => {
  const apiUrl = String(process.env.REACT_APP_API_URL || '').trim();
  const useMock = !apiUrl;

  /** 아이템 추가 함수
   *  아이템은 함수 사용 시 sessionId와 itemId를 객체로 넘겨줘야함
   *  items에 해당 아이템 이름만 저장 -> 컴포넌트에서 사진과 연동
   */
  const addItem = async (item) => {
    if (useMock) {
      const sessionId = String(item?.sessionId || '').trim();
      const itemId = Number(item?.itemId || 0);
      const itemName = itemNameById[itemId];
      if (!sessionId || !itemName) return;

      const userObj = loadMockUser(sessionId);
      if (!userObj) return;

      if (!Array.isArray(userObj.inventory)) {
        userObj.inventory = [];
      }

      const exists = userObj.inventory.some((x) => Number(x?.itemId) === itemId);
      if (!exists) {
        userObj.inventory.push({ itemId, itemName });
        saveMockUser(sessionId, userObj);
      }
      return;
    }
    try {
      await axios.post(`${apiUrl}/inventory/add`, item);
    } catch (error) {
      console.error('아이템 추가 중 오류가 발생했습니다:', error);
    }
  };

  /** 아이템 삭제 */
  const deleteItem = async ({ sessionId, itemId }) => {
    if (useMock) {
      const sid = String(sessionId || '').trim();
      const targetId = Number(itemId || 0);
      if (!sid || !targetId) return;
      const userObj = loadMockUser(sid);
      if (!userObj || !Array.isArray(userObj.inventory)) return;
      userObj.inventory = userObj.inventory.filter((x) => Number(x?.itemId) !== targetId);
      saveMockUser(sid, userObj);
      return;
    }
    try {
      await axios.delete(`${apiUrl}/inventory/delete`, {
        data: { sessionId, itemId },
      });
    } catch (error) {
      console.error('아이템 삭제 중 오류가 발생했습니다:', error);
    }
  };

  return <InventoryContext2.Provider value={{ addItem, deleteItem }}>{children}</InventoryContext2.Provider>;
};

export const useInventory2 = () => {
  const context = useContext(InventoryContext2);
  if (!context) {
    throw new Error('useInventory must be used within an InventoryProvider');
  }
  return context;
};
