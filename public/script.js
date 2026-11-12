let globalStudentsData = [];
let globalRequestsData = [];
let adminSessionToken = null;

document.addEventListener('DOMContentLoaded', () => {
  fetch('/api/students').catch(() => {});
  updateElectives();

  const lrnInput = document.getElementById('lrn');
  if (lrnInput) {
    lrnInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/[^0-9]/g, '');
    });
  }

  const btnChangeCredentials = document.getElementById('btnChangeCredentials');
  if (btnChangeCredentials) {
    btnChangeCredentials.addEventListener('click', openChangeCredentialsModal);
  }

  const btnStudentRequestEdit = document.getElementById('btnStudentRequestEdit');
  if (btnStudentRequestEdit) {
    btnStudentRequestEdit.addEventListener('click', openStudentCorrectionRequestModal);
  }

  const btnStudentSelfEdit = document.getElementById('btnStudentSelfEdit');
  if (btnStudentSelfEdit) {
    btnStudentSelfEdit.addEventListener('click', openStudentSelfEditOTPFlow);
  }
});

const electivesData = {
  "Academic Track": {
    term1: ["Computer Programming / ICT", "Basic Entrepreneurship", "Journalism & Creative Writing", "Speech and Stage Arts"],
    term2: ["Web Development Basics", "Financial Literacy & Accounting", "Environmental Science", "Digital Media & Arts"],
    term3: ["Advanced Computer Science", "Business Plan & Innovation", "Research & Data Analytics", "Work Immersion Elective"]
  },
  "TVL Track": {
    term1: ["Computer Systems Servicing (CSS)", "Cookery & Culinary Basics", "Bread & Pastry Production", "Electrical Installation & Maintenance"],
    term2: ["Network Fundamentals & Cabling", "Food & Beverage Service", "Commercial Cooking", "Shielded Metal Arc Welding (SMAW)"],
    term3: ["TVL Work Immersion / OJT", "Technical Drafting & CAD", "Automotive Servicing", "Agri-Crop Production"]
  }
};

function updateElectives() {
  const selectedTrackInput = document.querySelector('input[name="track"]:checked');
  if (!selectedTrackInput) return;

  const selectedTrack = selectedTrackInput.value;
  const data = electivesData[selectedTrack];

  if (data) {
    populateDropdown('term1Elective', data.term1, 'Select Term 1');
    populateDropdown('term2Elective', data.term2, 'Select Term 2');
    populateDropdown('term3Elective', data.term3, 'Select Term 3');
  }
}

function populateDropdown(selectId, options, placeholder) {
  const selectElem = document.getElementById(selectId);
  if (!selectElem) return;

  selectElem.innerHTML = `<option value="" disabled selected>${placeholder}</option>`;
  
  options.forEach(opt => {
    const optionNode = document.createElement('option');
    optionNode.value = opt;
    optionNode.textContent = opt;
    selectElem.appendChild(optionNode);
  });
}

document.querySelectorAll('input[name="track"]').forEach(radio => {
  radio.addEventListener('change', updateElectives);
});

// Submit Enrollment Form Logic with SweetAlert2
document.getElementById('enrollmentForm').addEventListener('submit', async function(e) {
  e.preventDefault();

  const lrnValue = document.getElementById('lrn').value;
  if (lrnValue.length !== 12) {
    Swal.fire({
      icon: 'warning',
      title: 'Invalid LRN',
      text: 'Learner Reference Number (LRN) must be exactly 12 digits.',
      confirmButtonColor: '#800000'
    });
    return;
  }

  const formData = {
    lrn: lrnValue,
    full_name: document.getElementById('fullName').value,
    address: document.getElementById('address').value,
    gmail: document.getElementById('gmail').value,
    contact_number: document.getElementById('contact').value,
    previous_school: document.getElementById('prevSchool').value,
    track: document.querySelector('input[name="track"]:checked').value,
    term1_elective: document.getElementById('term1Elective').value,
    term2_elective: document.getElementById('term2Elective').value,
    term3_elective: document.getElementById('term3Elective').value
  };

  Swal.fire({
    title: 'Submitting Enrollment...',
    text: 'Please wait...',
    allowOutsideClick: false,
    didOpen: () => { Swal.showLoading(); }
  });

  try {
    const response = await fetch('/api/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });

    const result = await response.json();
    Swal.close();

    if (response.ok && result.success) {
      Swal.fire({
        title: 'Enrollment Submitted!',
        html: `
          <p style="font-size: 0.95rem; color: #444; margin-bottom: 15px;">
            Thank you for registering! Your application has been saved and a confirmation email has been sent to <strong>${formData.gmail}</strong>.
          </p>
          <div style="background-color: #fdf0f0; padding: 12px; border-radius: 8px; border: 1px dashed #800000;">
            <span style="font-size: 0.85rem; color: #666; display: block;">Your Reference Number:</span>
            <strong style="font-size: 1.3rem; color: #800000; letter-spacing: 1px;">${result.reference_number}</strong>
          </div>
          <p style="font-size: 0.8rem; color: #777; margin-top: 12px;">
            Please save or take a screenshot of your reference number for verification.
          </p>
        `,
        icon: 'success',
        confirmButtonText: 'Great, Thanks!',
        confirmButtonColor: '#800000'
      }).then(() => {
        document.getElementById('enrollmentForm').reset();
        updateElectives();
      });
    } else {
      Swal.fire({
        title: 'Submission Failed',
        text: result.error || 'LRN is already registered or Database Error.',
        icon: 'error',
        confirmButtonColor: '#800000'
      });
    }
  } catch (error) {
    Swal.close();
    Swal.fire({
      title: 'Server Error',
      text: 'Could not connect to the server. Please ensure the server is active.',
      icon: 'error',
      confirmButtonColor: '#800000'
    });
  }
});

// ==========================================
// STUDENT SELF-EDIT WITH GMAIL OTP VERIFICATION
// ==========================================
async function openStudentSelfEditOTPFlow(e) {
  if (e) e.preventDefault();

  const { value: refNumber } = await Swal.fire({
    title: 'Edit My Enrollment Record',
    html: `
      <p style="font-size: 0.85rem; color: #555; margin-bottom: 12px;">
        Enter your <strong>Reference Number</strong>. We will send a 6-digit One-Time PIN (OTP) to your registered Gmail address to verify your identity.
      </p>
      <input type="text" id="otpRefInput" class="swal2-input" placeholder="Reference No. (e.g., LSHS-2026-XXXX)">
    `,
    showCancelButton: true,
    confirmButtonText: 'Send OTP Code',
    confirmButtonColor: '#800000',
    preConfirm: () => {
      const val = document.getElementById('otpRefInput').value.trim();
      if (!val) {
        Swal.showValidationMessage('Please enter your Reference Number!');
        return false;
      }
      return val;
    }
  });

  if (!refNumber) return;

  Swal.fire({
    title: 'Sending OTP to Gmail...',
    text: 'Please wait...',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });

  try {
    const sendRes = await fetch('/api/student/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference_number: refNumber })
    });
    const sendData = await sendRes.json();
    Swal.close();

    if (!sendRes.ok || !sendData.success) {
      Swal.fire('Not Found', sendData.error || 'Reference Number not found.', 'error');
      return;
    }

    const { value: otpCode } = await Swal.fire({
      title: 'Verify Your Identity',
      html: `
        <p style="font-size: 0.85rem; color: #555; margin-bottom: 12px;">
          A 6-digit OTP has been sent to <strong>${sendData.masked_email}</strong>.<br>
          Enter the code below (valid for 10 minutes):
        </p>
        <input type="text" id="otpCodeInput" class="swal2-input" placeholder="6-Digit OTP" maxlength="6" style="text-align: center; letter-spacing: 6px; font-size: 1.3rem; font-weight: bold;">
      `,
      showCancelButton: true,
      confirmButtonText: 'Verify OTP',
      confirmButtonColor: '#800000',
      preConfirm: () => {
        const code = document.getElementById('otpCodeInput').value.trim();
        if (code.length !== 6) {
          Swal.showValidationMessage('Please enter the 6-digit OTP code!');
          return false;
        }
        return code;
      }
    });

    if (!otpCode) return;

    const verifyRes = await fetch('/api/student/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference_number: refNumber, otp: otpCode })
    });
    const verifyData = await verifyRes.json();

    if (!verifyRes.ok || !verifyData.success) {
      Swal.fire('Verification Failed', verifyData.error || 'Invalid or expired OTP code.', 'error');
      return;
    }

    openStudentVerifiedEditModal(verifyData.student, otpCode);

  } catch (err) {
    Swal.close();
    Swal.fire('Error', 'Could not connect to the server.', 'error');
  }
}

async function openStudentVerifiedEditModal(student, verifiedOtp) {
  const { value: updatedValues } = await Swal.fire({
    title: 'Update Your Information',
    html: `
      <div style="text-align: left; font-size: 0.85rem; display: flex; flex-direction: column; gap: 6px;">
        <p style="font-size: 0.8rem; color: #28a745; font-weight: 700; margin: 0 0 6px;">✓ Identity Verified (${student.reference_number})</p>
        <label style="font-weight:700;">LRN (12 Digits):</label>
        <input id="self-edit-lrn" class="swal2-input" value="${student.lrn}" maxlength="12" style="margin: 0 0 6px;">
        <label style="font-weight:700;">Full Name:</label>
        <input id="self-edit-name" class="swal2-input" value="${student.full_name}" style="margin: 0 0 6px;">
        <label style="font-weight:700;">Address:</label>
        <input id="self-edit-address" class="swal2-input" value="${student.address || ''}" style="margin: 0 0 6px;">
        <label style="font-weight:700;">Contact Number:</label>
        <input id="self-edit-contact" class="swal2-input" value="${student.contact_number || ''}" style="margin: 0 0 6px;">
        <label style="font-weight:700;">Previous School:</label>
        <input id="self-edit-prev" class="swal2-input" value="${student.previous_school || ''}" style="margin: 0 0 6px;">
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'Save Changes',
    confirmButtonColor: '#800000',
    preConfirm: () => {
      const lrn = document.getElementById('self-edit-lrn').value.trim();
      const full_name = document.getElementById('self-edit-name').value.trim();
      if (lrn.length !== 12 || !full_name) {
        Swal.showValidationMessage('Please provide a valid 12-digit LRN and Full Name.');
        return false;
      }
      return {
        reference_number: student.reference_number,
        otp: verifiedOtp,
        lrn,
        full_name,
        address: document.getElementById('self-edit-address').value.trim(),
        contact_number: document.getElementById('self-edit-contact').value.trim(),
        previous_school: document.getElementById('self-edit-prev').value.trim()
      };
    }
  });

  if (updatedValues) {
    try {
      const res = await fetch('/api/student/self-update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedValues)
      });
      const resData = await res.json();

      if (res.ok && resData.success) {
        Swal.fire({
          icon: 'success',
          title: 'Record Updated!',
          text: 'Your enrollment information has been successfully updated.',
          confirmButtonColor: '#800000'
        });
      } else {
        Swal.fire('Update Failed', resData.error || 'Could not update your record.', 'error');
      }
    } catch (err) {
      Swal.fire('Error', 'Server connection error.', 'error');
    }
  }
}

// STUDENT CORRECTION REQUEST MODAL
function openStudentCorrectionRequestModal(e) {
  if (e) e.preventDefault();

  Swal.fire({
    title: 'Request Record Correction',
    html: `
      <p style="font-size: 0.85rem; color: #555; margin-bottom: 12px;">
        Entered incorrect details in your enrollment form? Request a correction from the Registrar:
      </p>
      <input type="text" id="reqRef" class="swal2-input" placeholder="Reference No. (e.g., LSHS-2026-XXXX)">
      <input type="text" id="reqLrn" class="swal2-input" placeholder="12-digit LRN" maxlength="12">
      <textarea id="reqNotes" class="swal2-textarea" placeholder="Describe the changes needed (e.g., Incorrect LRN or Barangay address)" style="height: 90px;"></textarea>
    `,
    showCancelButton: true,
    confirmButtonText: 'Submit Request',
    confirmButtonColor: '#800000',
    preConfirm: () => {
      const reference_number = document.getElementById('reqRef').value.trim();
      const lrn = document.getElementById('reqLrn').value.trim();
      const notes = document.getElementById('reqNotes').value.trim();

      if (!reference_number || !lrn || !notes) {
        Swal.showValidationMessage('Please fill out all required fields!');
      }
      return { reference_number, lrn, notes };
    }
  }).then(async (result) => {
    if (result.isConfirmed) {
      try {
        const res = await fetch('/api/requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result.value)
        });
        const data = await res.json();

        if (res.ok && data.success) {
          Swal.fire({
            icon: 'success',
            title: 'Request Sent!',
            text: 'Your correction request has been submitted to the Registrar Dashboard.',
            confirmButtonColor: '#800000'
          });
        } else {
          Swal.fire('Failed', data.error || 'Reference Number or LRN not found.', 'error');
        }
      } catch (err) {
        Swal.fire('Error', 'Server connection error.', 'error');
      }
    }
  });
}

// ==========================================
// SECURE PERSONNEL LOGIN LOGIC
// ==========================================
document.getElementById('btnPersonnelLogin').addEventListener('click', function(e) {
  e.preventDefault();

  Swal.fire({
    title: '🔒 Personnel Login',
    html: `
      <p style="font-size: 0.82rem; color: #666; margin-bottom: 12px;">
        Authorized Registrar & Admin Access Only
      </p>
      <input type="text" id="adminUser" class="swal2-input" placeholder="Username" style="margin-bottom: 10px;">
      
      <div style="position: relative; width: 80%; margin: 0 auto 10px;">
        <input type="password" id="adminPass" class="swal2-input" placeholder="Password" style="width: 100%; margin: 0; padding-right: 40px;">
        <span id="toggleAdminPass" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); cursor: pointer; font-size: 1rem; user-select: none;" title="Show/Hide Password">👁️</span>
      </div>

      <p style="font-size: 0.75rem; color: #8a6d0b; margin-top: 10px; margin-bottom: 0;">
        ⚠️ Security Policy: Login locks for 5 mins after 3 failed attempts.
      </p>
    `,
    confirmButtonText: 'Sign In',
    confirmButtonColor: '#800000',
    showCancelButton: true,
    focusConfirm: false,
    didOpen: () => {
      const toggleBtn = document.getElementById('toggleAdminPass');
      const passInput = document.getElementById('adminPass');
      if (toggleBtn && passInput) {
        toggleBtn.addEventListener('click', () => {
          const isPass = passInput.type === 'password';
          passInput.type = isPass ? 'text' : 'password';
          toggleBtn.textContent = isPass ? '🙈' : '👁️';
        });
      }
    },
    preConfirm: () => {
      const username = Swal.getPopup().querySelector('#adminUser').value.trim();
      const password = Swal.getPopup().querySelector('#adminPass').value;

      if (!username || !password) {
        Swal.showValidationMessage('Please enter your username and password.');
        return false;
      }
      return { username, password };
    }
  }).then(async (result) => {
    if (result.isConfirmed) {
      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result.value)
        });

        const data = await res.json();

        if (res.ok && data.success) {
          adminSessionToken = data.token;

          Swal.fire({
            icon: 'success',
            title: 'Access Granted!',
            text: 'Successfully logged in as Personnel.',
            timer: 1000,
            showConfirmButton: false
          });

          switchToPersonnelMode();
          loadEnrolledStudents();
          loadCorrectionRequests();
        } else {
          Swal.fire({
            icon: 'error',
            title: 'Access Denied',
            text: data.error || 'Invalid username or password!',
            confirmButtonColor: '#800000'
          });
        }
      } catch (err) {
        Swal.fire({ 
          icon: 'error', 
          title: 'Connection Error', 
          text: 'Cannot connect to backend server.',
          confirmButtonColor: '#800000'
        });
      }
    }
  });
});

function switchToPersonnelMode() {
  document.getElementById('studentPublicView').style.display = 'none';
  document.getElementById('navLinksList').style.display = 'none';
  document.getElementById('navButtonsContainer').style.display = 'none';

  const dashboard = document.getElementById('adminDashboardSection');
  if (dashboard) {
    dashboard.style.cssText = "display: block !important; padding: 20px 4% 60px !important;";
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function switchToStudentMode() {
  document.getElementById('studentPublicView').style.display = 'block';
  document.getElementById('navLinksList').style.display = 'flex';
  document.getElementById('navButtonsContainer').style.display = 'flex';

  const dashboard = document.getElementById('adminDashboardSection');
  if (dashboard) {
    dashboard.style.cssText = "display: none !important;";
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function loadEnrolledStudents() {
  try {
    const response = await fetch('/api/students');
    const students = await response.json();
    globalStudentsData = students || [];

    updateSummaryCards(globalStudentsData, globalRequestsData);
    renderTableRows(globalStudentsData);
  } catch (err) {
    console.error('Failed to fetch students:', err);
  }
}

async function loadCorrectionRequests() {
  try {
    const response = await fetch('/api/requests');
    const requests = await response.json();
    globalRequestsData = requests || [];

    updateSummaryCards(globalStudentsData, globalRequestsData);
    renderRequestsTable(globalRequestsData);
  } catch (err) {
    console.error('Failed to fetch requests:', err);
  }
}

function updateSummaryCards(students, requests = []) {
  const total = students.length;
  const acad = students.filter(s => s.track === 'Academic Track').length;
  const tvl = students.filter(s => s.track === 'TVL Track').length;
  const pendingRequests = requests.length;

  document.getElementById('statTotalEnrollees').textContent = total;
  document.getElementById('statAcademicCount').textContent = acad;
  document.getElementById('statTvlCount').textContent = tvl;
  if (document.getElementById('statRequestsCount')) {
    document.getElementById('statRequestsCount').textContent = pendingRequests;
  }
}

function renderTableRows(students) {
  const tbody = document.getElementById('studentsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!students || students.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 20px; color: #777;">No matching student submissions found.</td></tr>`;
    return;
  }

  students.forEach(st => {
    const tr = document.createElement('tr');
    const trackBadgeClass = st.track === 'Academic Track' ? 'badge-track-acad' : 'badge-track-tvl';
    const isApproved = st.status === 'Approved';

    const statusBadge = isApproved
      ? `<span style="background: #d4edda; color: #155724; padding: 4px 10px; border-radius: 12px; font-weight: 700; font-size: 0.78rem; white-space: nowrap;">✅ Approved</span>`
      : `<span style="background: #fff3cd; color: #856404; padding: 4px 10px; border-radius: 12px; font-weight: 700; font-size: 0.78rem; white-space: nowrap;">⏳ Pending</span>`;

    const approveButtonHtml = !isApproved
      ? `<button 
          onclick="approveStudent(${st.id}, '${st.full_name}')" 
          style="background: #28a745; color: #ffffff; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 0.82rem;">
          ✓ Approve
        </button>`
      : '';

    tr.innerHTML = `
      <td style="padding: 12px 16px; font-weight: 700; color: #800000;">${st.reference_number || 'N/A'}</td>
      <td style="padding: 12px 16px;">${st.lrn}</td>
      <td style="padding: 12px 16px;"><strong>${st.full_name}</strong></td>
      <td style="padding: 12px 16px;">${st.gmail}</td>
      <td style="padding: 12px 16px;">${st.contact_number}</td>
      <td style="padding: 12px 16px;"><span class="${trackBadgeClass}">${st.track}</span></td>
      <td style="padding: 12px 16px;">${st.term1_elective}</td>
      <td style="padding: 12px 16px;">${st.term2_elective}</td>
      <td style="padding: 12px 16px;">${st.term3_elective}</td>
      <td style="padding: 12px 16px;">${statusBadge}</td>
      <td style="padding: 12px 16px; text-align: center;">
        <div style="display: flex; gap: 6px; justify-content: center;">
          ${approveButtonHtml}
          <button 
            onclick="editStudent(${st.id})" 
            style="background: #cca43b; color: #ffffff; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 0.82rem;">
            Edit
          </button>
          <button 
            onclick="deleteStudent(${st.id}, '${st.full_name}')" 
            style="background: #dc3545; color: #ffffff; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 0.82rem;">
            Delete
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// APPROVE STUDENT & SEND GMAIL NOTIFICATION
async function approveStudent(studentId, studentName) {
  const confirmResult = await Swal.fire({
    title: 'Approve Student Enrollment?',
    html: `Approve <strong>${studentName}</strong> and send an official acceptance email to their Gmail?`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#28a745',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'Yes, Approve & Notify!'
  });

  if (!confirmResult.isConfirmed) return;

  Swal.fire({
    title: 'Approving & Sending Email...',
    text: 'Please wait...',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });

  try {
    const res = await fetch(`/api/students/${studentId}/approve`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': adminSessionToken || ''
      }
    });
    const data = await res.json();
    Swal.close();

    if (res.ok && data.success) {
      Swal.fire({
        icon: 'success',
        title: 'Enrollment Approved!',
        text: data.message || `${studentName} has been approved and notified via Gmail.`,
        confirmButtonColor: '#800000'
      });
      loadEnrolledStudents();
    } else {
      Swal.fire('Approval Failed', data.error || 'Could not approve student.', 'error');
    }
  } catch (err) {
    Swal.close();
    Swal.fire('Error', 'Server connection error.', 'error');
  }
}

function renderRequestsTable(requests) {
  const tbody = document.getElementById('requestsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!requests || requests.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px; color: #777;">No pending student correction requests.</td></tr>`;
    return;
  }

  requests.forEach(req => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="padding: 12px 16px; font-weight: 700; color: #800000;">${req.reference_number}</td>
      <td style="padding: 12px 16px;">${req.lrn}</td>
      <td style="padding: 12px 16px;"><strong>${req.student_name || 'N/A'}</strong></td>
      <td style="padding: 12px 16px; color: #d9534f; font-weight: 600;">${req.notes}</td>
      <td style="padding: 12px 16px;">${new Date(req.created_at).toLocaleDateString()}</td>
      <td style="padding: 12px 16px; text-align: center;">
        <button 
          onclick="resolveAndEditRequest(${req.id}, ${req.student_id})" 
          style="background: #28a745; color: #ffffff; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 0.82rem;">
          Review & Edit
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function resolveAndEditRequest(requestId, studentId) {
  await editStudent(studentId);

  try {
    await fetch(`/api/requests/${requestId}`, { method: 'DELETE' });
    loadCorrectionRequests();
  } catch (err) {
    console.error('Failed to resolve request', err);
  }
}

// EDIT STUDENT RECORD MODAL LOGIC (PERSONNEL)
async function editStudent(studentId) {
  const student = globalStudentsData.find(s => s.id === studentId);
  if (!student) return;

  const { value: formValues } = await Swal.fire({
    title: 'Edit Student Application',
    html: `
      <div style="text-align: left; font-size: 0.85rem; display: flex; flex-direction: column; gap: 8px;">
        <label style="font-weight:700;">LRN:</label>
        <input id="swal-edit-lrn" class="swal2-input" value="${student.lrn}" maxlength="12" style="margin: 0 0 8px;">
        <label style="font-weight:700;">Full Name:</label>
        <input id="swal-edit-name" class="swal2-input" value="${student.full_name}" style="margin: 0 0 8px;">
        <label style="font-weight:700;">Address:</label>
        <input id="swal-edit-address" class="swal2-input" value="${student.address || ''}" style="margin: 0 0 8px;">
        <label style="font-weight:700;">Gmail Address:</label>
        <input id="swal-edit-gmail" class="swal2-input" value="${student.gmail}" style="margin: 0 0 8px;">
        <label style="font-weight:700;">Contact Number:</label>
        <input id="swal-edit-contact" class="swal2-input" value="${student.contact_number}" style="margin: 0 0 8px;">
        <label style="font-weight:700;">Previous School:</label>
        <input id="swal-edit-prev" class="swal2-input" value="${student.previous_school || ''}" style="margin: 0 0 8px;">
      </div>
    `,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: 'Save Changes',
    confirmButtonColor: '#800000',
    preConfirm: () => {
      const lrn = document.getElementById('swal-edit-lrn').value;
      if (lrn.length !== 12) {
        Swal.showValidationMessage('LRN must be exactly 12 digits');
        return false;
      }
      return {
        lrn: lrn,
        full_name: document.getElementById('swal-edit-name').value,
        address: document.getElementById('swal-edit-address').value,
        gmail: document.getElementById('swal-edit-gmail').value,
        contact_number: document.getElementById('swal-edit-contact').value,
        previous_school: document.getElementById('swal-edit-prev').value,
        track: student.track,
        term1_elective: student.term1_elective,
        term2_elective: student.term2_elective,
        term3_elective: student.term3_elective
      };
    }
  });

  if (formValues) {
    try {
      const res = await fetch(`/api/students/${studentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminSessionToken || ''
        },
        body: JSON.stringify(formValues)
      });
      const resData = await res.json();

      if (res.ok && resData.success) {
        Swal.fire({
          icon: 'success',
          title: 'Student Updated!',
          text: 'Record has been successfully updated.',
          timer: 1500,
          showConfirmButton: false
        });
        loadEnrolledStudents();
      } else {
        Swal.fire('Error', resData.error || 'Failed to update record.', 'error');
      }
    } catch (err) {
      Swal.fire('Error', 'Could not connect to backend server.', 'error');
    }
  }
}

// CHANGE PERSONNEL CREDENTIALS MODAL LOGIC
function openChangeCredentialsModal() {
  Swal.fire({
    title: 'Account Settings',
    text: 'Update Personnel Dashboard Credentials',
    html: `
      <input type="password" id="oldPass" class="swal2-input" placeholder="Current Password">
      <input type="text" id="newUser" class="swal2-input" placeholder="New Username">
      <input type="password" id="newPass" class="swal2-input" placeholder="New Password (min 6 chars)">
    `,
    showCancelButton: true,
    confirmButtonText: 'Update Credentials',
    confirmButtonColor: '#800000',
    preConfirm: () => {
      const old_password = document.getElementById('oldPass').value;
      const new_username = document.getElementById('newUser').value;
      const new_password = document.getElementById('newPass').value;

      if (!old_password || !new_username || !new_password) {
        Swal.showValidationMessage('Please fill in all fields!');
      }
      return { old_password, new_username, new_password };
    }
  }).then(async (result) => {
    if (result.isConfirmed) {
      try {
        const res = await fetch('/api/admin/credentials', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-token': adminSessionToken || ''
          },
          body: JSON.stringify(result.value)
        });
        const data = await res.json();

        if (res.ok && data.success) {
          Swal.fire('Success!', 'Personnel account credentials updated.', 'success');
        } else {
          Swal.fire('Failed', data.error || 'Could not update credentials.', 'error');
        }
      } catch (err) {
        Swal.fire('Error', 'Server connection error.', 'error');
      }
    }
  });
}

function filterDashboardData() {
  const query = document.getElementById('dashboardSearch').value.toLowerCase().trim();
  const trackFilter = document.getElementById('dashboardFilterTrack').value;

  const filtered = globalStudentsData.filter(st => {
    const matchQuery = (st.full_name || '').toLowerCase().includes(query) ||
                       (st.lrn || '').toLowerCase().includes(query) ||
                       (st.reference_number || '').toLowerCase().includes(query);
    const matchTrack = trackFilter === 'ALL' || st.track === trackFilter;

    return matchQuery && matchTrack;
  });

  renderTableRows(filtered);
}

document.getElementById('dashboardSearch')?.addEventListener('input', filterDashboardData);
document.getElementById('dashboardFilterTrack')?.addEventListener('change', filterDashboardData);

// Export CSV / Excel Functionality
document.getElementById('btnExportCSV')?.addEventListener('click', () => {
  if (!globalStudentsData || globalStudentsData.length === 0) {
    Swal.fire({
      icon: 'info',
      title: 'No Data to Export',
      text: 'There are currently no student enrollment records available to export.',
      confirmButtonColor: '#800000'
    });
    return;
  }

  const headers = ["Ref. No.", "LRN", "Full Name", "Gmail", "Contact", "Address", "Previous School", "Track", "Term 1 Elective", "Term 2 Elective", "Term 3 Elective", "Status"];
  const rows = globalStudentsData.map(st => [
    `"${st.reference_number || ''}"`,
    `"${st.lrn || ''}"`,
    `"${st.full_name || ''}"`,
    `"${st.gmail || ''}"`,
    `"${st.contact_number || ''}"`,
    `"${st.address || ''}"`,
    `"${st.previous_school || ''}"`,
    `"${st.track || ''}"`,
    `"${st.term1_elective || ''}"`,
    `"${st.term2_elective || ''}"`,
    `"${st.term3_elective || ''}"`,
    `"${st.status || 'Pending'}"`
  ]);

  const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `LSHS_Early_Enrollment_Records_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

async function deleteStudent(studentId, studentName) {
  const confirmResult = await Swal.fire({
    title: 'Delete Student Record?',
    text: `Are you sure you want to delete the enrollment record of ${studentName}? This action cannot be undone.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc3545',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'Yes, Delete It!'
  });

  if (!confirmResult.isConfirmed) return;

  try {
    const response = await fetch(`/api/students/${studentId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': adminSessionToken || ''
      }
    });

    const result = await response.json();

    if (response.ok && result.success) {
      Swal.fire({
        icon: 'success',
        title: 'Record Deleted!',
        text: 'Student application record has been removed.',
        timer: 1500,
        showConfirmButton: false
      });
      loadEnrolledStudents();
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Delete Failed',
        text: result.error || 'Could not delete the record.',
        confirmButtonColor: '#800000'
      });
    }
  } catch (err) {
    console.error('Error deleting student:', err);
    Swal.fire({
      icon: 'error',
      title: 'Server Error',
      text: 'An error occurred while deleting the student record.',
      confirmButtonColor: '#800000'
    });
  }
}

const btnLogout = document.getElementById('btnLogout');
if (btnLogout) {
  btnLogout.addEventListener('click', async function() {
    if (adminSessionToken) {
      await fetch('/api/logout', {
        method: 'POST',
        headers: { 'x-admin-token': adminSessionToken }
      }).catch(() => {});
      adminSessionToken = null;
    }

    switchToStudentMode();
    Swal.fire({
      icon: 'info',
      title: 'Logged Out',
      text: 'You have been signed out of the Personnel Dashboard.',
      timer: 1500,
      showConfirmButton: false
    });
  });
}