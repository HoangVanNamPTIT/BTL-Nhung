import { useMemo, useState } from "react";
import { Button, Input, Modal, Spinner, toast } from "../common";

const OnboardingWizardModal = ({ isOpen, onClose, onVerify, onComplete }) => {
  const [step, setStep] = useState(1);
  const [macAddress, setMacAddress] = useState("");
  const [claimPin, setClaimPin] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [roomNames, setRoomNames] = useState([]);
  const [verifiedDevice, setVerifiedDevice] = useState(null);
  const [isBusy, setIsBusy] = useState(false);

  const canVerify = useMemo(
    () => macAddress.trim() && claimPin.trim(),
    [macAddress, claimPin],
  );

  const resetState = () => {
    setStep(1);
    setMacAddress("");
    setClaimPin("");
    setDeviceName("");
    setRoomNames([]);
    setVerifiedDevice(null);
    setIsBusy(false);
  };

  const closeModal = () => {
    if (isBusy) {
      return;
    }
    onClose();
    resetState();
  };

  const handleVerify = async () => {
    if (!canVerify || isBusy) {
      return;
    }

    setIsBusy(true);
    try {
      const verifyResult = await onVerify({
        mac_address: macAddress.trim(),
        claim_pin: claimPin.trim(),
      });

      if (!verifyResult?.success) {
        toast.error(verifyResult?.error || "Unable to verify device");
        setIsBusy(false);
        return;
      }

      // Store verified device info and pre-fill form
      const device = verifyResult?.device;
      setVerifiedDevice(device);
      
      // Pre-fill with device info from database
      if (device) {
        setDeviceName(device.device_name || "");
        // Don't pre-fill rooms here - will be fetched from backend
        setRoomNames([]);
      }

      setStep(2);

      setTimeout(() => {
        setStep(3);
        setIsBusy(false);
      }, 700);
    } catch {
      toast.error("Unable to verify device");
      setIsBusy(false);
    }
  };

  const handleComplete = async () => {
    if (isBusy) {
      return;
    }

    setIsBusy(true);

    const rooms = roomNames
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => ({ room_name: name }));

    try {
      const result = await onComplete({
        mac_address: macAddress.trim(),
        claim_pin: claimPin.trim(),
        device_name: deviceName.trim() || verifiedDevice?.device_name || "",
        rooms: rooms.length ? rooms : [],
      });

      if (!result?.success) {
        toast.error(result?.error || "Failed to complete onboarding");
        setIsBusy(false);
        return;
      }

      setStep(4);
      setIsBusy(false);
      toast.success("Device added successfully");
      setTimeout(() => {
        onClose();
        resetState();
      }, 500);
    } catch {
      toast.error("Failed to complete onboarding");
      setIsBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={closeModal} title="Add Device" size="lg">
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span
            className={`h-2 w-2 rounded-full ${step >= 1 ? "bg-sky-500" : "bg-slate-300"}`}
          />
          <span>1. Verify</span>
          <span
            className={`h-2 w-2 rounded-full ${step >= 2 ? "bg-sky-500" : "bg-slate-300"}`}
          />
          <span>2. Connect</span>
          <span
            className={`h-2 w-2 rounded-full ${step >= 3 ? "bg-sky-500" : "bg-slate-300"}`}
          />
          <span>3. Configure</span>
          <span
            className={`h-2 w-2 rounded-full ${step >= 4 ? "bg-sky-500" : "bg-slate-300"}`}
          />
          <span>4. Complete</span>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <Input
              label="MAC Address"
              value={macAddress}
              onChange={(e) => setMacAddress(e.target.value)}
              placeholder="AA:BB:CC:DD:EE:FF"
            />
            <Input
              label="Claim PIN"
              value={claimPin}
              onChange={(e) => setClaimPin(e.target.value)}
              placeholder="123456"
            />
            <Button
              className="w-full"
              onClick={handleVerify}
              disabled={!canVerify || isBusy}
            >
              Verify
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="flex min-h-40 flex-col items-center justify-center gap-4">
            <Spinner size="lg" />
            <p className="font-medium text-slate-700">
              Connecting to backend...
            </p>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-700">
              <p className="font-medium">Device: {verifiedDevice?.device_name}</p>
              <p className="text-xs text-blue-600 mt-1">
                This device already has rooms configured in the system.
              </p>
            </div>

            <Input
              label="Device Name"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder={verifiedDevice?.device_name || "Device Name"}
            />

            <div className="text-sm text-slate-600 bg-slate-50 rounded p-3">
              <p className="font-medium mb-2">Existing Rooms:</p>
              {verifiedDevice?.rooms && verifiedDevice.rooms.length > 0 ? (
                <ul className="space-y-1">
                  {verifiedDevice.rooms.map((room, idx) => (
                    <li key={idx} className="text-slate-700">
                      • {room.room_name}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-500 italic">No rooms configured</p>
              )}
            </div>

            <Button
              className="w-full"
              onClick={handleComplete}
              disabled={isBusy}
            >
              Complete
            </Button>
          </div>
        )}

        {step === 4 && (
          <div className="flex min-h-40 flex-col items-center justify-center gap-3">
            <p className="text-xl font-semibold text-emerald-700">
              Onboarding complete
            </p>
            <p className="text-sm text-slate-500">
              Your device is now available on the dashboard.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default OnboardingWizardModal;
