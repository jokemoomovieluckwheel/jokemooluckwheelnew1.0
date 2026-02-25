/**
 * การตั้งค่า API วงล้อ
 * - ถ้าโฮสต์แยกกัน: ใส่ WHEEL_API_BASE เป็น URL ของ Apps Script (เช่น https://script.google.com/macros/s/xxx/exec)
 * - ถ้าใส่แล้ว โค้ดจะเก็บที่ server ใช้ได้ทุกเครื่อง/ทุกโฮสต์
 * - ถ้าไม่ใส่ (ค่าว่าง) จะใช้ localStorage ในเครื่องนี้เท่านั้น
 */
(function () {
    'use strict';
    // ใส่ URL จาก Google Apps Script (Deploy > Deploy as web app > Execute as: Me, Who has access: Anyone)
    window.WHEEL_API_BASE = 'https://jokemoomovieluckwheel.github.io/jokemooluckwheelnew1.0/';
    // ลิงก์ไปหน้าสร้างโค้ด (ถ้าโฮสต์คนละโดเมน ใส่ URL เต็ม เช่น https://example.com/สร้างโค้ด/)
    window.LINK_CREATE_CODE = 'https://jokemoomovieluckwheel.github.io/codejokemoo/';
})();
