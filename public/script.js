let globalStudentsData = [];
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

  // Hide "Request Edit" button on Student View
  const reqEditBtn = document.getElementById('btnStudentRequestEdit');
  if (reqEditBtn) {
    reqEditBtn.style.display = 'none';
  }

  // Hide "Pending Student Correction Requests" section & divider on Dashboard
  const requestsTableBody = document.getElementById('requestsTableBody');
  if (requestsTableBody) {
    const requestsTable = requestsTableBody.closest('table');
    const requestsWrapper = requestsTable ? requestsTable.parentElement : null;
    if (requestsWrapper) {
      requestsWrapper.style.display = 'none';
      // Hide the heading & divider line right above the table if present
      let prev = requestsWrapper.previousElementSibling;
      while (prev && (prev.tagName === 'HR' || prev.tagName === 'H2' || prev.tagName === 'H3' || prev.textContent.includes('Correction Requests'))) {
        prev.style.display = 'none';
        prev = prev.previousElementSibling;
      }
    }
  }

  // Hide "Edit Requests" summary card at the top of Dashboard
  const statRequestsCard = document.getElementById('statRequestsCount')?.closest('div');
  if (statRequestsCard) {
    statRequestsCard.style.display = 'none';
  }

  // Student Self-Edit via OTP Button
  document.getElementById('btnStudentSelfEdit')?.addEventListener('click', openStudentSelfEditOTPFlow);

  // Personnel Dashboard Action Buttons
  document.getElementById('btnCreateNewPersonnel')?.addEventListener('click', openCreateNewPersonnelModal);
  document.getElementById('btnRefreshData')?.addEventListener('click', () => {
    loadEnrolledStudents();
    Swal.fire({
      icon: 'success',
      title: 'Refreshed!',
      text: 'Latest student records loaded.',
      timer: 1000,
      showConfirmButton: false
    });
  });

  // Search & Track Filter Listeners
  document.getElementById('searchStudentInput')?.addEventListener('input', applyDashboardFilters);
  document.getElementById('filterTrackSelect')?.addEventListener('change', applyDashboardFilters);

  // Export CSV / Excel Button
  document.getElementById('btnExportCSV')?.addEventListener('click', exportStudentsToCSV);

  // Hide Account Settings button and replace with "+ Add New Personnel"
  const credBtn = document.getElementById('btnChangeCredentials');
  if (credBtn) {
    credBtn.style.display = 'none';
    if (!document.getElementById('btnCreateNewPersonnel')) {
      const newStaffBtn = document.createElement('button');
      newStaffBtn.id = 'btnCreateNewPersonnel';
      newStaffBtn.type = 'button';
      newStaffBtn.innerHTML = '➕ Add New Personnel';
      newStaffBtn.style.cssText = 'background: #198754; color: #fff; border: none; padding: 8px 14px; border-radius: 6px; font-weight: 600; cursor: pointer; margin-right: 8px; font-size: 0.85rem;';
      newStaffBtn.addEventListener('click', openCreateNewPersonnelModal);
      credBtn.parentNode.insertBefore(newStaffBtn, credBtn.nextSibling);
    }
  }
});

// ==========================================
// 1. TRACKS & ELECTIVES DROPDOWN LOGIC
// ==========================================
const electivesData = {
  "Academic Track": {
    term1: [
      "Computer Programming / ICT",
      "Basic Entrepreneurship",
      "Journalism & Creative Writing",
      "Speech and Stage Arts"
    ],
    term2: [
      "Web Development Basics",
      "Financial Literacy & Accounting",
      "Environmental Science",
      "Digital Media & Arts"
    ],
    term3: [
      "Advanced Computer Science",
      "Business Plan & Innovation",
      "Research & Data Analytics",
      "Work Immersion Elective"
    ]
  },
  "TVL Track": {
    term1: [
      "Computer Systems Servicing (CSS)",
      "Cookery & Culinary Basics",
      "Bread & Pastry Production",
      "Electrical Installation & Maintenance"
    ],
    term2: [
      "Network Fundamentals & Cabling",
      "Food & Beverage Service",
      "Commercial Cooking",
      "Shielded Metal Arc Welding (SMAW)"
    ],
    term3: [
      "TVL Work Immersion / OJT",
      "Technical Drafting & CAD",
      "Automotive Servicing",
      "Agri-Crop Production"
    ]
  }
};

function updateElectives() {
  const selectedTrackInput = document.querySelector('input[name="track"]:checked');
  if (!selectedTrackInput) return;

  const data = electivesData[selectedTrackInput.value];
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

// ==========================================
// 2. STUDENT ENROLLMENT REVIEW SCREEN + GMAIL OTP VERIFICATION
// ==========================================
document.getElementById('enrollmentForm')?.addEventListener('submit', async function(e) {
  e.preventDefault();

  const lrnValue = document.getElementById('lrn').value.trim();
  if (lrnValue.length !== 12) {
    Swal.fire({
      icon: 'warning',
      title: 'Invalid LRN',
      text: 'LRN must be exactly 12 digits.',
      confirmButtonColor: '#800000'
    });
    return;
  }

  const formData = {
    lrn: lrnValue,
    full_name: document.getElementById('fullName').value.trim(),
    address: document.getElementById('address').value.trim(),
    gmail: document.getElementById('gmail').value.trim(),
    contact_number: document.getElementById('contact').value.trim(),
    previous_school: document.getElementById('prevSchool').value.trim(),
    track: document.querySelector('input[name="track"]:checked').value,
    term1_elective: document.getElementById('term1Elective').value,
    term2_elective: document.getElementById('term2Elective').value,
    term3_elective: document.getElementById('term3Elective').value
  };

  // STEP 1: Show Full Application Summary Review Screen
  const reviewConfirm = await Swal.fire({
    title: '📋 Review Your Enrollment Details',
    html: `
      <p style="font-size: 0.85rem; color: #555; margin-bottom: 12px;">
        Please double-check all your details below—especially your <strong>Gmail Address</strong>—before verifying via OTP.
      </p>
      <div style="text-align: left; background: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px 15px; font-size: 0.86rem; line-height: 1.65;">
        <div><strong>LRN:</strong> ${formData.lrn}</div>
        <div><strong>Full Name:</strong> ${formData.full_name}</div>
        <div><strong>Address:</strong> ${formData.address}</div>
        <div style="color: #800000;"><strong>Gmail Address:</strong> ${formData.gmail}</div>
        <div><strong>Contact Number:</strong> ${formData.contact_number}</div>
        <div><strong>Previous School:</strong> ${formData.previous_school}</div>
        <hr style="margin: 8px 0; border: 0; border-top: 1px solid #ddd;">
        <div><strong>Selected Track:</strong> ${formData.track}</div>
        <div><strong>Term 1 Elective:</strong> ${formData.term1_elective}</div>
        <div><strong>Term 2 Elective:</strong> ${formData.term2_elective}</div>
        <div><strong>Term 3 Elective:</strong> ${formData.term3_elective}</div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: '📧 Send OTP to Verify Gmail',
    cancelButtonText: '✏️ Go Back & Edit',
    confirmButtonColor: '#800000',
    cancelButtonColor: '#6c757d',
    width: '540px'
  });

  if (!reviewConfirm.isConfirmed) return;

  // STEP 2: Send 6-Digit OTP to verify that Gmail is valid and active
  Swal.fire({
    title: 'Sending Verification OTP...',
    text: `Sending 6-digit PIN to ${formData.gmail}...`,
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });

  try {
    const otpRes = await fetch('/api/enroll/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });

    const otpData = await otpRes.json();
    Swal.close();

    if (!otpRes.ok || !otpData.success) {
      Swal.fire({
        icon: 'error',
        title: 'Verification Failed',
        text: otpData.error || 'Could not send OTP to your Gmail. Please check your spelling.',
        confirmButtonColor: '#800000'
      });
      return;
    }

    // STEP 3: Ask Student to Enter the 6-Digit OTP from their Gmail
    const { value: enteredOtp } = await Swal.fire({
      title: '📧 Verify Your Gmail Address',
      html: `
        <p style="font-size: 0.88rem; color: #444; margin-bottom: 10px;">
          We sent a 6-digit verification code to <strong>${formData.gmail}</strong>.<br>
          Enter the code below to complete your enrollment:
        </p>
      `,
      input: 'text',
      inputAttributes: {
        maxlength: 6,
        style: 'text-align: center; letter-spacing: 6px; font-size: 1.35rem; font-weight: bold;'
      },
      showCancelButton: true,
      confirmButtonText: 'Verify & Submit Enrollment',
      confirmButtonColor: '#800000',
      preConfirm: (val) => {
        if (!val || val.trim().length !== 6) {
          Swal.showValidationMessage('Please enter the 6-digit verification code from your Gmail.');
          return false;
        }
        return val.trim();
      }
    });

    if (!enteredOtp) return;

    // STEP 4: Finalize Enrollment & Save to Aiven Database
    Swal.fire({
      title: 'Finalizing Enrollment...',
      text: 'Saving your verified application...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    const response = await fetch('/api/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...formData, otp: enteredOtp })
    });

    const result = await response.json();
    Swal.close();

    if (response.ok && result.success) {
      Swal.fire({
        title: 'Enrollment Verified & Submitted!',
        html: `
          <p style="font-size: 0.95rem; color: #444; margin-bottom: 15px;">
            Your Gmail is verified and your confirmation receipt has been sent to <strong>${formData.gmail}</strong>.
          </p>
          <div style="background-color: #fdf0f0; padding: 14px; border-radius: 8px; border: 1px dashed #800000;">
            <span style="font-size: 0.85rem; color: #666; display: block; margin-bottom: 4px;">
              Your Reference Number (Save this for tracking & editing):
            </span>
            <strong style="font-size: 1.35rem; color: #800000; letter-spacing: 1px;">
              ${result.reference_number}
            </strong>
          </div>
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
        icon: 'error',
        title: 'Submission Failed',
        text: result.error || 'Invalid OTP or error occurred during enrollment.',
        confirmButtonColor: '#800000'
      });
    }
  } catch (error) {
    Swal.close();
    Swal.fire({
      icon: 'error',
      title: 'Server Error',
      text: 'Could not connect to the server. Please try again later.',
      confirmButtonColor: '#800000'
    });
  }
});

// ==========================================
// 3. STUDENT OTP SELF-EDIT FLOW
// ==========================================
async function openStudentSelfEditOTPFlow(e) {
  if (e) e.preventDefault();

  const { value: refNumber } = await Swal.fire({
    title: 'Edit My Enrollment Record',
    html: `
      <p style="font-size: 0.85rem; color: #555; margin-bottom: 10px;">
        Enter your Reference Number. We will send a 6-digit OTP to your verified Gmail to unlock your record.
      </p>
      <input type="text" id="otpRefInput" class="swal2-input" placeholder="e.g., LSHS-2026-XXXX">
    `,
    showCancelButton: true,
    confirmButtonText: 'Send OTP Code',
    confirmButtonColor: '#800000',
    preConfirm: () => {
      const val = document.getElementById('otpRefInput').value.trim();
      if (!val) {
        Swal.showValidationMessage('Please enter your Reference Number.');
        return false;
      }
      return val;
    }
  });

  if (!refNumber) return;

  Swal.fire({
    title: 'Sending OTP...',
    text: 'Delivering security code to your registered Gmail...',
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
        <p style="font-size: 0.88rem; color: #444; margin-bottom: 10px;">
          A 6-digit OTP has been sent to <strong>${sendData.masked_email}</strong>.<br>Enter code below:
        </p>
      `,
      input: 'text',
      inputAttributes: {
        maxlength: 6,
        style: 'text-align: center; letter-spacing: 6px; font-size: 1.3rem; font-weight: bold;'
      },
      showCancelButton: true,
      confirmButtonText: 'Verify OTP',
      confirmButtonColor: '#800000',
      preConfirm: (val) => {
        if (!val || val.trim().length !== 6) {
          Swal.showValidationMessage('Please enter the 6-digit OTP.');
          return false;
        }
        return val.trim();
      }
    });

    if (!otpCode) return;

    Swal.fire({
      title: 'Verifying...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    const verifyRes = await fetch('/api/student/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference_number: refNumber, otp: otpCode })
    });

    const verifyData = await verifyRes.json();
    Swal.close();

    if (!verifyRes.ok || !verifyData.success) {
      Swal.fire('Verification Failed', verifyData.error || 'Invalid or expired OTP.', 'error');
      return;
    }

    openStudentVerifiedEditModal(verifyData.student, otpCode);
  } catch (err) {
    Swal.close();
    Swal.fire('Error', 'Connection error. Please try again.', 'error');
  }
}

async function openStudentVerifiedEditModal(student, verifiedOtp) {
  const { value: updatedValues } = await Swal.fire({
    title: 'Update Your Information',
    html: `
      <div style="text-align: left; display: flex; flex-direction: column; gap: 8px; font-size: 0.88rem;">
        <label style="font-weight: 600;">Learner Reference Number (LRN):</label>
        <input id="self-edit-lrn" class="swal2-input" value="${student.lrn}" maxlength="12" style="margin:0;">
        
        <label style="font-weight: 600;">Full Name:</label>
        <input id="self-edit-name" class="swal2-input" value="${student.full_name}" style="margin:0;">
        
        <label style="font-weight: 600;">Home Address:</label>
        <input id="self-edit-address" class="swal2-input" value="${student.address || ''}" style="margin:0;">
        
        <label style="font-weight: 600;">Contact Number:</label>
        <input id="self-edit-contact" class="swal2-input" value="${student.contact_number || ''}" style="margin:0;">
        
        <label style="font-weight: 600;">Previous School:</label>
        <input id="self-edit-prev" class="swal2-input" value="${student.previous_school || ''}" style="margin:0;">
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'Save Changes',
    confirmButtonColor: '#800000',
    preConfirm: () => {
      const lrn = document.getElementById('self-edit-lrn').value.trim();
      const full_name = document.getElementById('self-edit-name').value.trim();
      if (lrn.length !== 12) {
        Swal.showValidationMessage('LRN must be 12 digits.');
        return false;
      }
      if (!full_name) {
        Swal.showValidationMessage('Full Name cannot be empty.');
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
    Swal.fire({
      title: 'Saving Changes...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    const res = await fetch('/api/student/self-update', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedValues)
    });
    const resData = await res.json();
    Swal.close();

    if (res.ok && resData.success) {
      Swal.fire({
        icon: 'success',
        title: 'Updated!',
        text: 'Your enrollment record has been updated successfully.',
        confirmButtonColor: '#800000'
      });
    } else {
      Swal.fire('Update Failed', resData.error || 'Could not update record.', 'error');
    }
  }
}

// ==========================================
// 4. PERSONNEL DIRECT LOGIN + FORGOT PASSWORD LINK
// ==========================================
document.getElementById('btnPersonnelLogin')?.addEventListener('click', function(e) {
  e.preventDefault();

  Swal.fire({
    title: '🔒 Personnel Login',
    html: `
      <p style="font-size: 0.85rem; color: #666; margin-bottom: 12px;">Authorized Registrar & Admin Access Only</p>
      <input type="text" id="adminUser" class="swal2-input" placeholder="Username or Gmail" style="margin-bottom: 10px;">
      <div style="position: relative; width: 80%; margin: 0 auto 8px;">
        <input type="password" id="adminPass" class="swal2-input" placeholder="Password" style="width: 100%; margin: 0; padding-right: 40px;">
        <span id="toggleAdminPass" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); cursor: pointer; font-size: 1rem; user-select: none;" title="Show/Hide Password">👁️</span>
      </div>
      <div style="width: 80%; margin: 0 auto 10px; text-align: right;">
        <a href="#" id="linkForgotPassword" style="font-size: 0.8rem; color: #800000; font-weight: 600; text-decoration: underline;">Forgot / Reset Password?</a>
      </div>
      <p style="font-size: 0.75rem; color: #8a6d0b; margin-top: 6px; margin-bottom: 0;">⚠️ Security Policy: Login locks for 5 mins after 3 failed attempts.</p>
    `,
    confirmButtonText: 'Sign In',
    confirmButtonColor: '#800000',
    showCancelButton: true,
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

      document.getElementById('linkForgotPassword')?.addEventListener('click', (ev) => {
        ev.preventDefault();
        Swal.close();
        openForgotPasswordOTPFlow();
      });
    },
    preConfirm: () => {
      const username = document.getElementById('adminUser').value.trim();
      const password = document.getElementById('adminPass').value;
      if (!username || !password) {
        Swal.showValidationMessage('Please enter your username and password.');
        return false;
      }
      return { username, password };
    }
  }).then(async (result) => {
    if (result.isConfirmed) {
      Swal.fire({
        title: 'Signing In...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      });

      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result.value)
        });
        const data = await res.json();
        Swal.close();

        if (res.ok && data.success) {
          adminSessionToken = data.token;
          Swal.fire({
            icon: 'success',
            title: 'Access Granted!',
            text: `Welcome back, ${data.full_name || data.username}!`,
            timer: 1100,
            showConfirmButton: false
          });
          switchToPersonnelMode();
          loadEnrolledStudents();
        } else {
          Swal.fire({
            icon: 'error',
            title: 'Access Denied',
            text: data.error || 'Invalid credentials.',
            confirmButtonColor: '#800000'
          });
        }
      } catch (err) {
        Swal.close();
        Swal.fire('Error', 'Connection error.', 'error');
      }
    }
  });
});

// ==========================================
// 5. PERSONNEL FORGOT / RESET PASSWORD VIA GMAIL OTP
// ==========================================
async function openForgotPasswordOTPFlow() {
  const { value: identifier } = await Swal.fire({
    title: '🔑 Reset Personnel Password',
    html: `
      <p style="font-size: 0.85rem; color: #555; margin-bottom: 10px;">
        Enter your registered Username or Gmail address. We will send a 6-digit OTP to verify your identity.
      </p>
      <input type="text" id="resetIdentifierInput" class="swal2-input" placeholder="Username or Gmail">
    `,
    showCancelButton: true,
    confirmButtonText: 'Send Reset OTP',
    confirmButtonColor: '#800000',
    preConfirm: () => {
      const val = document.getElementById('resetIdentifierInput').value.trim();
      if (!val) {
        Swal.showValidationMessage('Please enter your username or email.');
        return false;
      }
      return val;
    }
  });

  if (!identifier) return;

  Swal.fire({
    title: 'Sending Reset OTP...',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });

  try {
    const res = await fetch('/api/personnel/forgot-password/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier })
    });
    const data = await res.json();
    Swal.close();

    if (!res.ok || !data.success) {
      Swal.fire('Not Found', data.error || 'Account not found.', 'error');
      return;
    }

    const { value: resetDetails } = await Swal.fire({
      title: '🛡️ Verify OTP & Set New Password',
      html: `
        <p style="font-size: 0.85rem; color: #555; margin-bottom: 10px;">
          Enter the 6-digit OTP sent to <strong>${data.masked_email}</strong>
        </p>
        <input type="text" id="resetOtpInput" class="swal2-input" placeholder="6-Digit OTP" maxlength="6" style="text-align: center; letter-spacing: 6px; font-weight: bold;">
        <input type="password" id="resetNewPassInput" class="swal2-input" placeholder="New Password (min. 6 chars)">
      `,
      showCancelButton: true,
      confirmButtonText: 'Reset Password',
      confirmButtonColor: '#800000',
      preConfirm: () => {
        const otp = document.getElementById('resetOtpInput').value.trim();
        const new_password = document.getElementById('resetNewPassInput').value.trim();
        if (!otp || otp.length !== 6) {
          Swal.showValidationMessage('Please enter the 6-digit OTP.');
          return false;
        }
        if (new_password.length < 6) {
          Swal.showValidationMessage('New password must be at least 6 characters.');
          return false;
        }
        return { username: data.username, otp, new_password };
      }
    });

    if (!resetDetails) return;

    Swal.fire({
      title: 'Updating Password...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    const saveRes = await fetch('/api/personnel/forgot-password/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(resetDetails)
    });
    const saveData = await saveRes.json();
    Swal.close();

    if (saveRes.ok && saveData.success) {
      Swal.fire({
        icon: 'success',
        title: 'Password Updated!',
        text: saveData.message,
        confirmButtonColor: '#800000'
      });
    } else {
      Swal.fire('Reset Failed', saveData.error || 'Invalid or expired OTP.', 'error');
    }
  } catch (err) {
    Swal.close();
    Swal.fire('Error', 'Connection error.', 'error');
  }
}

// ==========================================
// 6. CREATE NEW PERSONNEL ACCOUNT WITH GMAIL OTP VERIFICATION
// ==========================================
async function openCreateNewPersonnelModal() {
  const { value: staffDetails } = await Swal.fire({
    title: '➕ Create New Personnel Account',
    html: `
      <p style="font-size: 0.82rem; color: #555; margin-bottom: 10px;">
        A 6-digit verification OTP will be sent to the new personnel's Gmail before the account is created.
      </p>
      <div style="text-align: left; display: flex; flex-direction: column; gap: 6px;">
        <label style="font-size: 0.8rem; font-weight: 600;">Full Name:</label>
        <input type="text" id="newStaffFullName" class="swal2-input" placeholder="e.g., Maria Santos" style="margin: 0;">
        
        <label style="font-size: 0.8rem; font-weight: 600;">Username:</label>
        <input type="text" id="newStaffUsername" class="swal2-input" placeholder="e.g., msantos" style="margin: 0;">
        
        <label style="font-size: 0.8rem; font-weight: 600;">Active Gmail Address:</label>
        <input type="email" id="newStaffEmail" class="swal2-input" placeholder="e.g., maria@gmail.com" style="margin: 0;">
        
        <label style="font-size: 0.8rem; font-weight: 600;">Password (min. 6 chars):</label>
        <input type="password" id="newStaffPassword" class="swal2-input" placeholder="Enter password" style="margin: 0;">
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'Send Gmail Verification OTP',
    confirmButtonColor: '#198754',
    preConfirm: () => {
      const full_name = document.getElementById('newStaffFullName').value.trim();
      const username = document.getElementById('newStaffUsername').value.trim();
      const email = document.getElementById('newStaffEmail').value.trim();
      const password = document.getElementById('newStaffPassword').value.trim();

      if (!full_name || !username || !email || !password) {
        Swal.showValidationMessage('Please fill out all fields.');
        return false;
      }
      if (!email.includes('@')) {
        Swal.showValidationMessage('Please enter a valid Gmail address.');
        return false;
      }
      if (password.length < 6) {
        Swal.showValidationMessage('Password must be at least 6 characters.');
        return false;
      }
      return { full_name, username, email, password };
    }
  });

  if (!staffDetails) return;

  Swal.fire({
    title: 'Sending Verification OTP...',
    text: `Sending to ${staffDetails.email}...`,
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });

  try {
    const sendRes = await fetch('/api/personnel/create/send-otp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': adminSessionToken
      },
      body: JSON.stringify(staffDetails)
    });
    const sendData = await sendRes.json();
    Swal.close();

    if (!sendRes.ok || !sendData.success) {
      Swal.fire('Failed', sendData.error || 'Could not send OTP.', 'error');
      return;
    }

    const { value: enteredOtp } = await Swal.fire({
      title: '📧 Verify New Personnel Gmail',
      html: `Enter the 6-digit OTP sent to <strong>${staffDetails.email}</strong> to confirm the email is valid and active:`,
      input: 'text',
      inputAttributes: {
        maxlength: 6,
        style: 'text-align: center; letter-spacing: 6px; font-size: 1.3rem; font-weight: bold;'
      },
      showCancelButton: true,
      confirmButtonText: 'Verify & Create Account',
      confirmButtonColor: '#198754',
      preConfirm: (val) => {
        if (!val || val.trim().length !== 6) {
          Swal.showValidationMessage('Please enter the 6-digit verification OTP.');
          return false;
        }
        return val.trim();
      }
    });

    if (!enteredOtp) return;

    Swal.fire({
      title: 'Creating Account...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    const verifyRes = await fetch('/api/personnel/create/verify-and-save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': adminSessionToken
      },
      body: JSON.stringify({ ...staffDetails, otp: enteredOtp })
    });
    const verifyData = await verifyRes.json();
    Swal.close();

    if (verifyRes.ok && verifyData.success) {
      Swal.fire({
        icon: 'success',
        title: 'Account Created!',
        text: verifyData.message,
        confirmButtonColor: '#800000'
      });
    } else {
      Swal.fire('Verification Failed', verifyData.error || 'Invalid or expired OTP.', 'error');
    }
  } catch (err) {
    Swal.close();
    Swal.fire('Error', 'Connection error.', 'error');
  }
}

// ==========================================
// 7. DASHBOARD VIEWS, FILTERS & CSV EXPORT
// ==========================================
function switchToPersonnelMode() {
  document.getElementById('studentPublicView').style.display = 'none';
  document.getElementById('navLinksList').style.display = 'none';
  document.getElementById('navButtonsContainer').style.display = 'none';
  document.getElementById('adminDashboardSection').style.cssText = "display: block !important; padding: 20px 4% 60px !important;";
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function switchToStudentMode() {
  document.getElementById('studentPublicView').style.display = 'block';
  document.getElementById('navLinksList').style.display = 'flex';
  document.getElementById('navButtonsContainer').style.display = 'flex';
  document.getElementById('adminDashboardSection').style.cssText = "display: none !important;";
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function loadEnrolledStudents() {
  try {
    const res = await fetch('/api/students');
    globalStudentsData = await res.json() || [];
    updateSummaryCards(globalStudentsData);
    applyDashboardFilters();
  } catch (err) {
    console.error('Error loading students:', err);
  }
}

function updateSummaryCards(students) {
  const totalElem = document.getElementById('statTotalEnrollees');
  const acadElem = document.getElementById('statAcademicCount');
  const tvlElem = document.getElementById('statTvlCount');

  if (totalElem) totalElem.textContent = students.length;
  if (acadElem) acadElem.textContent = students.filter(s => s.track === 'Academic Track').length;
  if (tvlElem) tvlElem.textContent = students.filter(s => s.track === 'TVL Track').length;
}

function applyDashboardFilters() {
  const searchTerm = (document.getElementById('searchStudentInput')?.value || '').toLowerCase().trim();
  const trackFilter = document.getElementById('filterTrackSelect')?.value || 'All';

  const filtered = globalStudentsData.filter(st => {
    const matchesSearch =
      (st.full_name || '').toLowerCase().includes(searchTerm) ||
      (st.lrn || '').toLowerCase().includes(searchTerm) ||
      (st.reference_number || '').toLowerCase().includes(searchTerm) ||
      (st.gmail || '').toLowerCase().includes(searchTerm);

    const matchesTrack = trackFilter === 'All' || st.track === trackFilter;
    return matchesSearch && matchesTrack;
  });

  renderTableRows(filtered);
}

function exportStudentsToCSV() {
  if (globalStudentsData.length === 0) {
    Swal.fire('No Data', 'There are no student records to export.', 'info');
    return;
  }

  const headers = [
    'Reference Number',
    'LRN',
    'Full Name',
    'Address',
    'Gmail',
    'Contact Number',
    'Previous School',
    'Track',
    'Term 1 Elective',
    'Term 2 Elective',
    'Term 3 Elective',
    'Status'
  ];

  const csvRows = [headers.join(',')];

  globalStudentsData.forEach(st => {
    const row = [
      `"${st.reference_number || ''}"`,
      `"${st.lrn || ''}"`,
      `"${st.full_name || ''}"`,
      `"${(st.address || '').replace(/"/g, '""')}"`,
      `"${st.gmail || ''}"`,
      `"${st.contact_number || ''}"`,
      `"${(st.previous_school || '').replace(/"/g, '""')}"`,
      `"${st.track || ''}"`,
      `"${st.term1_elective || ''}"`,
      `"${st.term2_elective || ''}"`,
      `"${st.term3_elective || ''}"`,
      `"${st.status || 'Pending'}"`
    ];
    csvRows.push(row.join(','));
  });

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `LSHS_Early_Enrollment_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ==========================================
// 8. RENDER STUDENT TABLE + CRUD
// ==========================================
function renderTableRows(students) {
  const tbody = document.getElementById('studentsTableBody');
  if (!tbody) return;

  if (students.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 24px; color: #777;">No matching student records found.</td></tr>`;
    return;
  }

  tbody.innerHTML = '';

  students.forEach(st => {
    const tr = document.createElement('tr');
    const isApproved = st.status === 'Approved';

    tr.innerHTML = `
      <td style="padding: 12px 16px; font-weight: 700; color: #800000;">${st.reference_number}</td>
      <td style="padding: 12px 16px;">${st.lrn}</td>
      <td style="padding: 12px 16px;"><strong>${st.full_name}</strong></td>
      <td style="padding: 12px 16px;">${st.gmail}</td>
      <td style="padding: 12px 16px;">${st.contact_number}</td>
      <td style="padding: 12px 16px;">
        <span class="${st.track === 'Academic Track' ? 'badge-track-acad' : 'badge-track-tvl'}">
          ${st.track}
        </span>
      </td>
      <td style="padding: 12px 16px;">${st.term1_elective}</td>
      <td style="padding: 12px 16px;">${st.term2_elective}</td>
      <td style="padding: 12px 16px;">${st.term3_elective}</td>
      <td style="padding: 12px 16px;">
        ${isApproved
          ? '<span style="background: #d4edda; color: #155724; padding: 4px 10px; border-radius: 12px; font-weight: 700; font-size: 0.78rem;">✅ Approved</span>'
          : '<span style="background: #fff3cd; color: #856404; padding: 4px 10px; border-radius: 12px; font-weight: 700; font-size: 0.78rem;">⏳ Pending</span>'}
      </td>
      <td style="padding: 12px 16px; text-align: center;">
        <div style="display: flex; gap: 6px; justify-content: center;">
          ${!isApproved ? `<button onclick="approveStudent(${st.id}, '${st.full_name}')" style="background: #28a745; color: #fff; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 0.82rem;">✓ Approve</button>` : ''}
          <button onclick="editStudent(${st.id})" style="background: #cca43b; color: #fff; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 0.82rem;">Edit</button>
          <button onclick="deleteStudent(${st.id}, '${st.full_name}')" style="background: #dc3545; color: #fff; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 0.82rem;">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function approveStudent(id, name) {
  const confirm = await Swal.fire({
    title: 'Approve Enrollment?',
    text: `Approve ${name} and send official acceptance email via Gmail?`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Yes, Approve',
    confirmButtonColor: '#28a745'
  });

  if (!confirm.isConfirmed) return;

  Swal.fire({
    title: 'Approving...',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });

  try {
    const res = await fetch(`/api/students/${id}/approve`, {
      method: 'PUT',
      headers: { 'x-admin-token': adminSessionToken }
    });
    const data = await res.json();
    Swal.close();

    if (res.ok && data.success) {
      Swal.fire('Approved!', data.message, 'success');
      loadEnrolledStudents();
    } else {
      Swal.fire('Failed', data.error || 'Could not approve student.', 'error');
    }
  } catch (err) {
    Swal.close();
    Swal.fire('Error', 'Connection error.', 'error');
  }
}

async function editStudent(id) {
  const student = globalStudentsData.find(s => s.id === id);
  if (!student) return;

  const { value: formValues } = await Swal.fire({
    title: 'Edit Student Application',
    html: `
      <div style="text-align: left; display: flex; flex-direction: column; gap: 8px; font-size: 0.88rem;">
        <label style="font-weight: 600;">LRN:</label>
        <input id="swal-edit-lrn" class="swal2-input" value="${student.lrn}" maxlength="12" style="margin:0;">
        
        <label style="font-weight: 600;">Full Name:</label>
        <input id="swal-edit-name" class="swal2-input" value="${student.full_name}" style="margin:0;">
        
        <label style="font-weight: 600;">Address:</label>
        <input id="swal-edit-address" class="swal2-input" value="${student.address || ''}" style="margin:0;">
        
        <label style="font-weight: 600;">Gmail:</label>
        <input id="swal-edit-gmail" class="swal2-input" value="${student.gmail}" style="margin:0;">
        
        <label style="font-weight: 600;">Contact Number:</label>
        <input id="swal-edit-contact" class="swal2-input" value="${student.contact_number}" style="margin:0;">
        
        <label style="font-weight: 600;">Previous School:</label>
        <input id="swal-edit-prev" class="swal2-input" value="${student.previous_school || ''}" style="margin:0;">
        
        <label style="font-weight: 600;">Track:</label>
        <select id="swal-edit-track" class="swal2-input" style="margin:0;">
          <option value="Academic Track" ${student.track === 'Academic Track' ? 'selected' : ''}>Academic Track</option>
          <option value="TVL Track" ${student.track === 'TVL Track' ? 'selected' : ''}>TVL Track</option>
        </select>
        
        <label style="font-weight: 600;">Term 1 Elective:</label>
        <input id="swal-edit-t1" class="swal2-input" value="${student.term1_elective || ''}" style="margin:0;">
        
        <label style="font-weight: 600;">Term 2 Elective:</label>
        <input id="swal-edit-t2" class="swal2-input" value="${student.term2_elective || ''}" style="margin:0;">
        
        <label style="font-weight: 600;">Term 3 Elective:</label>
        <input id="swal-edit-t3" class="swal2-input" value="${student.term3_elective || ''}" style="margin:0;">
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'Save Changes',
    confirmButtonColor: '#800000',
    preConfirm: () => ({
      lrn: document.getElementById('swal-edit-lrn').value.trim(),
      full_name: document.getElementById('swal-edit-name').value.trim(),
      address: document.getElementById('swal-edit-address').value.trim(),
      gmail: document.getElementById('swal-edit-gmail').value.trim(),
      contact_number: document.getElementById('swal-edit-contact').value.trim(),
      previous_school: document.getElementById('swal-edit-prev').value.trim(),
      track: document.getElementById('swal-edit-track').value,
      term1_elective: document.getElementById('swal-edit-t1').value.trim(),
      term2_elective: document.getElementById('swal-edit-t2').value.trim(),
      term3_elective: document.getElementById('swal-edit-t3').value.trim()
    })
  });

  if (formValues) {
    const res = await fetch(`/api/students/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': adminSessionToken
      },
      body: JSON.stringify(formValues)
    });
    const resData = await res.json();

    if (res.ok && resData.success) {
      Swal.fire({
        icon: 'success',
        title: 'Updated!',
        text: 'Student record updated successfully.',
        timer: 1500,
        showConfirmButton: false
      });
      loadEnrolledStudents();
    } else {
      Swal.fire('Error', resData.error || 'Failed to update record.', 'error');
    }
  }
}

async function deleteStudent(id, name) {
  const confirm = await Swal.fire({
    title: 'Delete Record?',
    text: `Are you sure you want to permanently delete ${name}'s record?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Yes, Delete',
    confirmButtonColor: '#dc3545'
  });

  if (!confirm.isConfirmed) return;

  const res = await fetch(`/api/students/${id}`, {
    method: 'DELETE',
    headers: { 'x-admin-token': adminSessionToken }
  });

  if (res.ok) {
    Swal.fire({
      icon: 'success',
      title: 'Deleted!',
      timer: 1500,
      showConfirmButton: false
    });
    loadEnrolledStudents();
  }
}

document.getElementById('btnLogout')?.addEventListener('click', async () => {
  if (adminSessionToken) {
    await fetch('/api/logout', {
      method: 'POST',
      headers: { 'x-admin-token': adminSessionToken }
    }).catch(() => {});
  }
  adminSessionToken = null;
  switchToStudentMode();
});